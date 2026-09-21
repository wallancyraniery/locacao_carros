import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

describe("retenção preserva vínculos operacionais", () => {
  let sql: ReturnType<typeof postgres>;
  let writer: ReturnType<typeof postgres>;
  let org: string, vehicle: string, ids: string[];
  const validations = {
    validateTarget: async () => undefined,
    validateMigrations: async () => undefined,
    validateStructure: async () => undefined,
  };
  beforeAll(() => {
    const { testDatabaseUrl } = parseTestDatabaseEnvironment(process.env);
    sql = postgres(testDatabaseUrl, { max: 1 });
    writer = postgres(testDatabaseUrl, { max: 1 });
  });
  beforeEach(async () => {
    org = crypto.randomUUID(); vehicle = crypto.randomUUID();
    ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await sql`insert into organizations (id, name, slug) values (${org}, 'Retenção sintética operacional', ${`retention_links_${org}`})`;
    await sql`insert into vehicles (id, organization_id, brand, model, year, color, weekly_price_cents, status, operational_status)
      values (${vehicle}, ${org}, 'Marca', 'Modelo', 2024, 'Prata', 70000, 'available', 'active')`;
    for (const id of ids) {
      await sql`insert into rental_leads (id, operation_id, organization_id, full_name, phone, city, has_definitive_license, created_at)
        values (${id}, ${crypto.randomUUID()}, ${org}, 'Pessoa sintética', '000000000', 'Cidade', true, now() - interval '120 days')`;
      await sql`insert into lead_status_history (organization_id, rental_lead_id, to_status) values (${org}, ${id}, 'contacted')`;
    }
  });
  afterEach(async () => {
    await sql.begin(async (tx) => {
      await tx`delete from notification_outbox where organization_id = ${org}`;
      await tx`delete from vehicle_schedule_blocks where organization_id = ${org}`;
      await tx`delete from reservation_requests where organization_id = ${org}`;
      await tx`delete from waitlist_entries where organization_id = ${org}`;
      await tx`delete from lead_status_history where organization_id = ${org}`;
      await tx`delete from rental_leads where organization_id = ${org}`;
      await tx`delete from vehicles where organization_id = ${org}`;
      await tx`delete from organizations where id = ${org}`;
    });
  });
  afterAll(async () => { await Promise.all([sql.end(), writer.end()]); });

  async function linkBoth() {
    await sql`insert into reservation_requests (organization_id, vehicle_id, lead_id, pickup_date, return_date)
      values (${org}, ${vehicle}, ${ids[1]}, '2027-01-10', '2027-01-15')`;
    await sql`insert into waitlist_entries (organization_id, vehicle_id, lead_id, pickup_date, return_date)
      values (${org}, ${vehicle}, ${ids[2]}, '2027-01-10', '2027-01-15')`;
  }

  it.each([false, true])("remove A, preserva B/reserva e C/waitlist e seus históricos (cancelados: %s)", async (cancelled) => {
    await linkBoth();
    if (cancelled) {
      const actor = crypto.randomUUID();
      await sql`update reservation_requests set status = 'approved', decided_by = ${actor} where organization_id = ${org}`;
      await sql`update reservation_requests set status = 'cancelled', cancelled_by = ${actor} where organization_id = ${org}`;
      await sql`update waitlist_entries set status = 'cancelled' where organization_id = ${org}`;
    }
    const adapter = createPostgresLeadRetentionAdapter(sql, validations);
    const preview = await adapter.preview(org, 90);
    expect(preview.candidates).toBe(1);
    expect(preview.candidateIds).toEqual([ids[0]]);
    expect(await runLeadRetention(adapter, { organizationId: org, execute: true, confirmation: leadRetentionConfirmation }))
      .toMatchObject({ deletedLeads: 1, deletedHistory: 1, preservedLinked: 0, remainingCandidates: 0 });
    expect((await sql`select id from rental_leads where organization_id = ${org}`).map((r) => r.id).sort()).toEqual(ids.slice(1).sort());
    expect(await sql`select id from lead_status_history where organization_id = ${org}`).toHaveLength(2);
    expect((await adapter.preview(org, 90)).candidates).toBe(0);
  });

  it("vínculos criados depois do preview preservam B/C e não impedem excluir A", async () => {
    const base = createPostgresLeadRetentionAdapter(sql, validations);
    const adapter = {
      ...base,
      async preview(id: string, days: number) {
        const preview = await base.preview(id, days);
        expect(preview.candidates).toBe(3);
        await linkBoth();
        return preview;
      },
    };
    expect(await runLeadRetention(adapter, { organizationId: org, execute: true, confirmation: leadRetentionConfirmation }))
      .toMatchObject({ deletedLeads: 1, deletedHistory: 1, preservedLinked: 2, remainingCandidates: 0 });
    expect((await sql`select id from rental_leads where organization_id = ${org}`).map((r) => r.id).sort()).toEqual(ids.slice(1).sort());
  });

  it.each(["reservation", "waitlist"])("reconsulta vínculo %s confirmado enquanto aguarda o lock do lead", async (kind) => {
    const adapter = createPostgresLeadRetentionAdapter(sql, validations);
    const preview = await adapter.preview(org, 90);
    const [retention] = await sql`select pg_backend_pid() as pid`;
    let deletion!: ReturnType<typeof adapter.deleteEligible>;
    await writer.begin(async (tx) => {
      await tx`set local statement_timeout = '4s'`;
      if (kind === "reservation") {
        await tx`insert into reservation_requests (organization_id, vehicle_id, lead_id, pickup_date, return_date)
          values (${org}, ${vehicle}, ${ids[1]}, '2027-01-10', '2027-01-15')`;
      } else {
        await tx`insert into waitlist_entries (organization_id, vehicle_id, lead_id, pickup_date, return_date)
          values (${org}, ${vehicle}, ${ids[1]}, '2027-01-10', '2027-01-15')`;
      }
      deletion = adapter.deleteEligible(org, 90, preview.candidates, preview.candidateFingerprint, preview.candidateIds);
      // Attach a rejection handler immediately; the assertion below still observes failures.
      void deletion.catch(() => undefined);
      let blocked = false;
      const deadline = Date.now() + 3000;
      while (!blocked && Date.now() < deadline) {
        const [row] = await tx`select pg_backend_pid() = any(pg_blocking_pids(${retention.pid})) as blocked`;
        blocked = row.blocked;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      // Commit the FK reference, then allow retention to acquire FOR UPDATE and re-read.
    });
    expect(await deletion).toMatchObject({ deletedLeads: 2, deletedHistory: 2, preservedLinked: 1, remainingCandidates: 0 });
    expect(await sql`select id from rental_leads where organization_id = ${org}`).toEqual([{ id: ids[1] }]);
    expect(await sql`select rental_lead_id from lead_status_history where organization_id = ${org}`).toEqual([{ rental_lead_id: ids[1] }]);
  }, 10000);
});
