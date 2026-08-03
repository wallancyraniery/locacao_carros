import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";

describe("estrutura PostgreSQL", () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    const { testDatabaseUrl } = parseTestDatabaseEnvironment(process.env);
    sql = postgres(testDatabaseUrl, { max: 1 });
  });
  afterAll(async () => { if (sql) await sql.end(); });

  it("possui as tabelas e enums esperados", async () => {
    const tables = await sql`select table_name from information_schema.tables where table_schema = 'public' and table_name in ('organizations','vehicles','rental_leads','lead_status_history') order by table_name`;
    expect(tables.map(({ table_name }) => table_name)).toEqual(["lead_status_history", "organizations", "rental_leads", "vehicles"]);
    const enums = await sql`select typname from pg_type where typname in ('vehicle_status','lead_status') order by typname`;
    expect(enums.map(({ typname }) => typname)).toEqual(["lead_status", "vehicle_status"]);
  });

  it("possui chaves estrangeiras, índices e constraints essenciais", async () => {
    const constraints = await sql`select conname from pg_constraint where conname in ('vehicles_organization_id_fk','vehicles_weekly_price_cents_non_negative_check','vehicles_year_reasonable_check','rental_leads_organization_id_fk','rental_leads_vehicle_id_fk','lead_status_history_organization_id_fk','lead_status_history_rental_lead_id_fk')`;
    expect(constraints).toHaveLength(7);
    const indexes = await sql`select indexname from pg_indexes where schemaname = 'public' and indexname in ('vehicles_organization_status_idx','rental_leads_organization_status_idx','rental_leads_organization_created_at_idx','lead_status_history_rental_lead_created_at_idx')`;
    expect(indexes).toHaveLength(4);
  });

  it("rejeita estado inválido e preço negativo", async () => {
    const [organization] = await sql`insert into organizations (name, slug) values ('Teste local', ${`test_${crypto.randomUUID()}`}) returning id`;
    await expect(sql`insert into vehicles (organization_id, brand, model, year, color, weekly_price_cents, status) values (${organization.id}, 'Marca', 'Modelo', 2020, 'Cor', -1, 'available')`).rejects.toThrow();
    await expect(sql`insert into vehicles (organization_id, brand, model, year, color, weekly_price_cents, status) values (${organization.id}, 'Marca', 'Modelo', 2020, 'Cor', 1, 'invalid')`).rejects.toThrow();
    await sql`delete from organizations where id = ${organization.id}`;
  });

  it("impede apagar registros com histórico associado", async () => {
    const [organization] = await sql`insert into organizations (name, slug) values ('Teste histórico', ${`history_${crypto.randomUUID()}`}) returning id`;
    const [lead] = await sql`insert into rental_leads (organization_id, full_name, phone, city, has_definitive_license) values (${organization.id}, 'Pessoa de teste', '000000000', 'Cidade de teste', true) returning id`;
    await sql`insert into lead_status_history (organization_id, rental_lead_id, to_status) values (${organization.id}, ${lead.id}, 'contacted')`;
    await expect(sql`delete from rental_leads where id = ${lead.id}`).rejects.toThrow();
    await sql`delete from lead_status_history where rental_lead_id = ${lead.id}`;
    await sql`delete from rental_leads where id = ${lead.id}`;
    await sql`delete from organizations where id = ${organization.id}`;
  });
});
