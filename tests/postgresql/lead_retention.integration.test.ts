import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";
import { leadRetentionConfirmation, runLeadRetention } from "../../scripts/lead_retention.mjs";
import { createPostgresLeadRetentionAdapter } from "../../scripts/lead_retention_postgres.mjs";

const organizationId = crypto.randomUUID();
const otherOrganizationId = crypto.randomUUID();
const eligibleIds = [crypto.randomUUID(), crypto.randomUUID()];
const recentId = crypto.randomUUID();
const convertedId = crypto.randomUUID();
const otherOrganizationLeadId = crypto.randomUUID();
const concurrentIds = [crypto.randomUUID(), crypto.randomUUID()];
const allLeadIds = [...eligibleIds, recentId, convertedId, otherOrganizationLeadId, ...concurrentIds];

describe("retenção administrativa de leads no PostgreSQL", () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    const { testDatabaseUrl } = parseTestDatabaseEnvironment(process.env);
    sql = postgres(testDatabaseUrl, { max: 1 });
    await sql`INSERT INTO organizations (id, name, slug) VALUES
      (${organizationId}, 'Organização retenção', ${`retention_${organizationId}`}),
      (${otherOrganizationId}, 'Outra organização retenção', ${`retention_${otherOrganizationId}`})`;
    await sql`INSERT INTO rental_leads (
      id, operation_id, organization_id, full_name, phone, city, has_definitive_license, status, created_at
    ) VALUES
      (${eligibleIds[0]}, ${crypto.randomUUID()}, ${organizationId}, 'Pessoa sintética um', '000000000', 'Cidade', true, 'new', now() - interval '91 days'),
      (${eligibleIds[1]}, ${crypto.randomUUID()}, ${organizationId}, 'Pessoa sintética dois', '000000000', 'Cidade', true, 'approved', now() - interval '120 days'),
      (${recentId}, ${crypto.randomUUID()}, ${organizationId}, 'Pessoa recente', '000000000', 'Cidade', true, 'new', now() - interval '89 days'),
      (${convertedId}, ${crypto.randomUUID()}, ${organizationId}, 'Pessoa convertida', '000000000', 'Cidade', true, 'converted', now() - interval '120 days'),
      (${otherOrganizationLeadId}, ${crypto.randomUUID()}, ${otherOrganizationId}, 'Pessoa outra organização', '000000000', 'Cidade', true, 'new', now() - interval '120 days'),
      (${concurrentIds[0]}, ${crypto.randomUUID()}, ${otherOrganizationId}, 'Pessoa concorrente', '000000000', 'Cidade', true, 'new', now() - interval '120 days')`;
    await sql`INSERT INTO lead_status_history (organization_id, rental_lead_id, to_status) VALUES
      (${organizationId}, ${eligibleIds[0]}, 'contacted'),
      (${organizationId}, ${convertedId}, 'converted')`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`DELETE FROM lead_status_history WHERE rental_lead_id = ANY(${allLeadIds}::uuid[])`;
    await sql`DELETE FROM rental_leads WHERE id = ANY(${allLeadIds}::uuid[])`;
    await sql`DELETE FROM organizations WHERE id IN (${organizationId}, ${otherOrganizationId})`;
    await sql.end();
  });

  it("faz rollback sem excluir quando o conjunto muda depois da prévia", async () => {
    const base = createPostgresLeadRetentionAdapter(sql, {
      validateTarget: async () => undefined,
      validateMigrations: async () => undefined,
      validateStructure: async () => undefined,
    });
    const adapter = {
      ...base,
      async preview(id: string, days: number) {
        const result = await base.preview(id, days);
        await sql`INSERT INTO rental_leads (
          id, operation_id, organization_id, full_name, phone, city, has_definitive_license, status, created_at
        ) VALUES (${concurrentIds[1]}, ${crypto.randomUUID()}, ${otherOrganizationId}, 'Pessoa concorrente dois', '000000000', 'Cidade', true, 'new', now() - interval '120 days')`;
        return result;
      },
    };
    await expect(runLeadRetention(adapter, {
      organizationId: otherOrganizationId, execute: true, confirmation: leadRetentionConfirmation,
    })).rejects.toMatchObject({ code: "CONCURRENT_STATE_CHANGE" });
    expect(await sql`SELECT id FROM rental_leads WHERE id = ANY(${concurrentIds}::uuid[])`).toHaveLength(2);
    await sql`DELETE FROM rental_leads WHERE id = ANY(${concurrentIds}::uuid[])`;
  });

  it("elimina somente leads vencidos não convertidos e permanece idempotente", async () => {
    const validations = {
      validateTarget: async () => undefined,
      validateMigrations: async () => undefined,
      validateStructure: async () => undefined,
    };
    const adapter = createPostgresLeadRetentionAdapter(sql, validations);

    await expect(runLeadRetention(adapter, { organizationId, execute: false })).resolves.toEqual({
      status: "preview", organizationId, retentionDays: 90, candidates: 2,
    });
    // Force a failure after history deletion and verify that the whole transaction rolls back.
    const blocker = `retention_blocker_${crypto.randomUUID().replaceAll("-", "")}`;
    await sql`CREATE TABLE ${sql(blocker)} (lead_id uuid REFERENCES public.rental_leads(id))`;
    try {
      await sql`INSERT INTO ${sql(blocker)} VALUES (${eligibleIds[0]})`;
      await expect(runLeadRetention(adapter, {
        organizationId, execute: true, confirmation: leadRetentionConfirmation,
      })).rejects.toMatchObject({ code: "23503" });
      expect(await sql`SELECT id FROM rental_leads WHERE id = ANY(${eligibleIds}::uuid[])`).toHaveLength(2);
      expect(await sql`SELECT rental_lead_id FROM lead_status_history WHERE rental_lead_id = ${eligibleIds[0]}`).toHaveLength(1);
    } finally {
      await sql`DROP TABLE ${sql(blocker)}`;
    }
    await expect(runLeadRetention(adapter, {
      organizationId, execute: true, confirmation: leadRetentionConfirmation,
    })).resolves.toMatchObject({ status: "deleted", deletedLeads: 2, deletedHistory: 1, remainingCandidates: 0 });
    expect(await sql`SELECT id FROM rental_leads WHERE id = ANY(${eligibleIds}::uuid[])`).toHaveLength(0);
    expect(await sql`SELECT id FROM rental_leads WHERE id IN (${recentId}, ${convertedId}, ${otherOrganizationLeadId}) ORDER BY id`).toHaveLength(3);
    expect(await sql`SELECT rental_lead_id FROM lead_status_history WHERE rental_lead_id = ${convertedId}`).toHaveLength(1);

    await expect(runLeadRetention(adapter, {
      organizationId, execute: true, confirmation: leadRetentionConfirmation,
    })).resolves.toEqual({ status: "already_compliant", organizationId, retentionDays: 90, candidates: 0 });
  });

  it("inclui exatamente 90 dias desde created_at, sem reiniciar por updated_at", async () => {
    await sql.begin(async (transaction) => {
      const boundaryIds = [crypto.randomUUID(), crypto.randomUUID()];
      const [before] = await transaction`SELECT count(*)::int AS count FROM rental_leads WHERE organization_id = ${organizationId}
        AND status <> 'converted' AND created_at <= transaction_timestamp() - interval '90 days'`;
      try {
        await transaction`INSERT INTO rental_leads (id, operation_id, organization_id, full_name, phone, city,
          has_definitive_license, created_at, updated_at) VALUES
          (${boundaryIds[0]}, ${crypto.randomUUID()}, ${organizationId}, 'Teste limite', '000000000', 'Cidade', true,
            transaction_timestamp() - interval '90 days', transaction_timestamp()),
          (${boundaryIds[1]}, ${crypto.randomUUID()}, ${organizationId}, 'Teste recente', '000000000', 'Cidade', true,
            transaction_timestamp() - interval '90 days' + interval '1 microsecond', transaction_timestamp())`;
        const adapter = createPostgresLeadRetentionAdapter(transaction, {
          validateTarget: async () => undefined,
          validateMigrations: async () => undefined,
          validateStructure: async () => undefined,
        });
        expect((await adapter.preview(organizationId, 90)).candidates).toBe(before.count + 1);
      } finally {
        await transaction`DELETE FROM rental_leads WHERE id = ANY(${boundaryIds}::uuid[])`;
      }
    });
  });
});
