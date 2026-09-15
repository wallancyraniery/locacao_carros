import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";

const orgs = [crypto.randomUUID(), crypto.randomUUID()];
const users = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
const vehicles = [crypto.randomUUID(), crypto.randomUUID()];
const leads = [crypto.randomUUID(), crypto.randomUUID()];

describe("Central: autorização real em PostgreSQL local", () => {
  let sql: ReturnType<typeof postgres>;
  async function asUser<T>(user: string | null, operation: () => Promise<T>, extra = {}) {
    await sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user, ...extra })}, false)`;
    await sql`set role authenticated`;
    try { return await operation(); } finally {
      await sql`reset role`;
      await sql`reset request.jwt.claims`;
    }
  }
  beforeAll(async () => {
    sql = postgres(parseTestDatabaseEnvironment(process.env).testDatabaseUrl, { max: 1 });
    for (let i = 0; i < 2; i++) {
      await sql`insert into organizations (id, name, slug) values (${orgs[i]}, 'Organização sintética', ${`central_${orgs[i]}`})`;
      await sql`insert into organization_memberships (user_id, organization_id) values (${users[i]}, ${orgs[i]})`;
      await sql`insert into vehicles (id, organization_id, brand, model, year, color, weekly_price_cents, status) values (${vehicles[i]}, ${orgs[i]}, 'Marca sintética', 'Modelo', 2024, 'Prata', 70000, 'available')`;
      await sql`insert into rental_leads (id, operation_id, organization_id, vehicle_id, full_name, phone, city, has_definitive_license) values (${leads[i]}, ${crypto.randomUUID()}, ${orgs[i]}, ${vehicles[i]}, 'Pessoa sintética', '11999990000', 'Cidade sintética', true)`;
    }
  });
  afterAll(async () => {
    if (!sql) return;
    await sql`reset role`;
    await sql`delete from rental_leads where id = any(${leads}::uuid[])`;
    await sql`delete from vehicles where id = any(${vehicles}::uuid[])`;
    await sql`delete from organization_memberships where user_id = any(${users}::uuid[])`;
    await sql`delete from organizations where id = any(${orgs}::uuid[])`;
    await sql.end();
  });

  it.each([0, 1])("associado %i lê somente sua organização, inclusive o veículo", async (i) => {
    await asUser(users[i], async () => {
      expect(await sql`select user_id, organization_id from organization_memberships`).toEqual([{ user_id: users[i], organization_id: orgs[i] }]);
      const rows = await sql`select l.id, l.created_at, l.full_name, l.phone, l.email, l.city, l.preferred_contact_time, l.status, v.brand, v.model, v.version, v.year from rental_leads l left join vehicles v on v.id = l.vehicle_id order by l.created_at desc, l.id desc limit 51`;
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(leads[i]);
      expect(rows[0].brand).toBe('Marca sintética');
      expect(await sql`select id from rental_leads where id = ${leads[1 - i]}`).toHaveLength(0);
      expect(await sql`select id from vehicles where id = ${vehicles[1 - i]}`).toHaveLength(0);
    });
  });

  it.each([null, users[2]])("sem identidade ou associação não lê leads (%s)", async (user) => {
    await asUser(user, async () => {
      expect(await sql`select id from rental_leads`).toHaveLength(0);
      expect(await sql`select id from vehicles`).toHaveLength(0);
      expect(await sql`select user_id from organization_memberships`).toHaveLength(0);
    }, { user_metadata: { organization_id: orgs[0], role: 'admin' } });
  });

  it("ignora organização forjada em user_metadata e rejeita Auth anônimo", async () => {
    await asUser(users[0], async () => {
      expect(await sql`select id from rental_leads`).toEqual([{ id: leads[0] }]);
    }, { user_metadata: { organization_id: orgs[1] } });
    await asUser(users[0], async () => {
      expect(await sql`select id from rental_leads`).toHaveLength(0);
    }, { is_anonymous: true });
  });

  it("anon e runtime continuam sem leitura de leads ou associações", async () => {
    for (const role of ['anon', 'lead_intake_runtime']) {
      await sql.unsafe(`set role ${role}`);
      try {
        await expect(sql`select id from rental_leads`).rejects.toMatchObject({ code: '42501' });
        await expect(sql`select user_id from organization_memberships`).rejects.toMatchObject({ code: '42501' });
      } finally { await sql`reset role`; }
    }
  });

  it("não concede escrita, histórico ou campos além da projeção", async () => {
    await asUser(users[0], async () => {
      for (const table of ['rental_leads', 'organization_memberships', 'vehicles']) {
        for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
          const [row] = await sql`select has_table_privilege(current_user, ${`public.${table}`}, ${privilege}) as allowed`;
          expect(row.allowed, `${table}: ${privilege}`).toBe(false);
        }
      }
      await expect(sql`update rental_leads set status = 'contacted' where id = ${leads[0]}`).rejects.toMatchObject({ code: '42501' });
      await expect(sql`delete from rental_leads where id = ${leads[0]}`).rejects.toMatchObject({ code: '42501' });
      await expect(sql`insert into organization_memberships (user_id, organization_id) values (${users[2]}, ${orgs[0]})`).rejects.toMatchObject({ code: '42501' });
      await expect(sql`select has_definitive_license from rental_leads`).rejects.toMatchObject({ code: '42501' });
      await expect(sql`select id from lead_status_history`).rejects.toMatchObject({ code: '42501' });
    });
  });

  it("revogação administrativa da associação remove a leitura imediatamente", async () => {
    await sql`delete from organization_memberships where user_id = ${users[1]}`;
    try {
      await asUser(users[1], async () => expect(await sql`select id from rental_leads`).toHaveLength(0));
    } finally {
      await sql`insert into organization_memberships (user_id, organization_id) values (${users[1]}, ${orgs[1]})`;
    }
  });

  it("resiste a uma policy permissiva ampla sem ampliar o escopo", async () => {
    await sql`create policy central_test_broad_select on rental_leads for select to authenticated using (true)`;
    try {
      await asUser(users[0], async () => expect(await sql`select id from rental_leads`).toEqual([{ id: leads[0] }]));
      await asUser(users[2], async () => expect(await sql`select id from rental_leads`).toHaveLength(0));
    } finally { await sql`drop policy central_test_broad_select on rental_leads`; }
  });
});
