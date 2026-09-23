import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";
let admin: ReturnType<typeof postgres>;
let api: ReturnType<typeof postgres>;
let concurrent: ReturnType<typeof postgres>;
const orgs = [crypto.randomUUID(), crypto.randomUUID()];
const users = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
const ids: string[] = [];
const data = () => { const id = crypto.randomUUID(); ids.push(id); return { id, brand: "Marca sintética", model: "Modelo", version: null as string | null, year: 2024, color: "Prata", price: 70050, state: "active" }; };
const call = (tx: postgres.TransactionSql, value: ReturnType<typeof data>) => tx`select public.create_fleet_vehicle(${value.id}::uuid, ${value.brand}, ${value.model}, ${value.version}, ${value.year}::integer, ${value.color}, ${value.price}::integer, ${value.state})::text as id`;
async function asUser<T>(user: string | null, run: (tx: postgres.TransactionSql) => Promise<T>, extra = {}, client = api, role = "authenticated") {
  return client.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user, ...extra })}, true)`;
    await tx.unsafe(`set local role ${role}`);
    return run(tx);
  });
}
beforeAll(async () => {
  const url = parseTestDatabaseEnvironment(process.env).testDatabaseUrl;
  admin = postgres(url, { max: 1 }); api = postgres(url, { max: 1 }); concurrent = postgres(url, { max: 1 });
  for (const [i, org] of orgs.entries()) {
    await admin`insert into organizations(id, name, slug) values (${org}, 'Locadora sintética', ${`fleet-${org}`})`;
    await admin`insert into organization_memberships(user_id, organization_id, role) values (${users[i]}, ${org}, 'owner')`;
  }
  await admin`insert into organization_memberships(user_id, organization_id, role) values (${users[2]}, ${orgs[0]}, 'member')`;
});
afterAll(async () => {
  if (admin) {
    await admin`delete from vehicles where organization_id = any(${orgs}::uuid[])`;
    await admin`delete from organization_memberships where organization_id = any(${orgs}::uuid[])`;
    await admin`delete from organizations where id = any(${orgs}::uuid[])`;
  }
  await Promise.all([admin?.end(), api?.end(), concurrent?.end()]);
});
it.each(["active", "inactive"])("owner cadastra veículo %s na própria locadora sem demo ou agenda", async (state) => {
  const value = { ...data(), state };
  expect(await asUser(users[0], (tx) => call(tx, value), { user_metadata: { organization_id: orgs[1], role: "owner" } })).toEqual([{ id: value.id }]);
  expect((await admin`select organization_id, is_demo, operational_status, status, weekly_price_cents from vehicles where id = ${value.id}`)[0])
    .toEqual({ organization_id: orgs[0], is_demo: false, operational_status: state, status: state === "active" ? "available" : "inactive", weekly_price_cents: 70050 });
  expect(await admin`select id from vehicle_schedule_blocks where vehicle_id = ${value.id}`).toHaveLength(0);
});
it("retry sequencial e concorrente cria somente um veículo", async () => {
  const value = data();
  const [a, b] = await Promise.all([asUser(users[0], (tx) => call(tx, value)), asUser(users[0], (tx) => call(tx, value), {}, concurrent)]);
  expect(a).toEqual(b); expect(await asUser(users[0], (tx) => call(tx, value))).toEqual(a);
  expect((await admin`select count(*)::int as count from vehicles where id=${value.id}`)[0].count).toBe(1);
  await expect(asUser(users[0], (tx) => call(tx, { ...value, model: "Outro" }))).rejects.toMatchObject({ code: "P3003" });
});
it("owner A não lê ou altera veículo B nem reaproveita seu ID", async () => {
  const value = data(); await asUser(users[1], (tx) => call(tx, value));
  expect(await asUser(users[0], (tx) => tx`select id, color, weekly_price_cents, operational_status from vehicles where id = ${value.id}`)).toEqual([]);
  await expect(asUser(users[0], (tx) => call(tx, value))).rejects.toMatchObject({ code: "P3003" });
  await expect(asUser(users[0], (tx) => tx`update vehicles set brand='forged' where id=${value.id}`)).rejects.toMatchObject({ code: "42501" });
  await expect(asUser(users[0], (tx) => tx`delete from vehicles where id=${value.id}`)).rejects.toMatchObject({ code: "42501" });
  expect((await admin`select organization_id,brand from vehicles where id=${value.id}`)[0]).toEqual({ organization_id: orgs[1], brand: value.brand });
});
it.each([null, "invalid", users[2], users[3]])("identidade %s não pode criar, mesmo com metadata owner", async (user) => {
  const value = data(); await expect(asUser(user, (tx) => call(tx, value), { user_metadata: { role: "owner", organization_id: orgs[0] } })).rejects.toMatchObject({ code: "42501" });
  expect(await admin`select id from vehicles where id=${value.id}`).toHaveLength(0);
});
it("Auth anônimo não cria nem lê e revogação bloqueia novos cadastros", async () => {
  await expect(asUser(users[0], (tx) => call(tx, data()), { is_anonymous: true })).rejects.toMatchObject({ code: "42501" });
  expect(await asUser(users[0], (tx) => tx`select id from vehicles`, { is_anonymous: true })).toEqual([]);
  await admin`update organization_memberships set role='member' where user_id=${users[1]}`;
  try { await expect(asUser(users[1], (tx) => call(tx, data()))).rejects.toMatchObject({ code: "42501" }); }
  finally { await admin`update organization_memberships set role='owner' where user_id=${users[1]}`; }
});
it.each([{ brand: "" }, { model: "x".repeat(121) }, { color: "a\nb" }, { year: 1899 }, { year: 2201 }, { price: -1 }, { state: "available" }])("SQL valida entrada direta %j sem persistência", async (overrides) => {
  const value = { ...data(), ...overrides }; await expect(asUser(users[0], (tx) => call(tx, value))).rejects.toMatchObject({ code: "P3001" });
  expect(await admin`select id from vehicles where id=${value.id}`).toHaveLength(0);
});
it("veículos demo não são reaproveitados e ficam fora da consulta da frota", async () => {
  const value = data(); await asUser(users[0], (tx) => call(tx, value)); await admin`update vehicles set is_demo=true where id=${value.id}`;
  expect(await asUser(users[0], (tx) => tx`select id from vehicles where not is_demo and id=${value.id}`)).toEqual([]);
  await expect(asUser(users[0], (tx) => call(tx, value))).rejects.toMatchObject({ code: "P3003" });
});
it("RLS continua restritiva mesmo com policy permissiva adicional", async () => {
  await admin`create policy fleet_test_broad on vehicles for select to authenticated using(true)`;
  try {
    const a = data(); const b = data(); await asUser(users[0], (tx) => call(tx, a)); await asUser(users[1], (tx) => call(tx, b));
    expect(await asUser(users[0], (tx) => tx`select id from vehicles where id = any(${[a.id,b.id]}::uuid[])`)).toEqual([{ id: a.id }]);
    expect(await asUser(users[3], (tx) => tx`select id from vehicles`)).toEqual([]);
  } finally { await admin`drop policy fleet_test_broad on vehicles`; }
});
it.each(["anon", "lead_intake_runtime"])("%s não executa fronteira nem recebe privilégios", async (role) => {
  await expect(asUser(users[0], (tx) => call(tx, data()), {}, api, role)).rejects.toMatchObject({ code: "42501" });
  expect((await admin`select has_function_privilege(${role}, 'fleet_private.create_vehicle(uuid,text,text,text,integer,text,integer,text)', 'EXECUTE') as allowed`)[0].allowed).toBe(false);
});
it("não concede escrita direta, reservas privadas ou colunas desnecessárias", async () => {
  for (const role of ["anon", "authenticated", "lead_intake_runtime"]) {
    for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      expect((await admin`select has_table_privilege(${role}, 'vehicles', ${privilege}) as allowed`)[0].allowed).toBe(false);
    }
  }
  await expect(asUser(users[0], (tx) => tx`select organization_id from vehicles`)).rejects.toMatchObject({ code: "42501" });
  await expect(asUser(users[0], (tx) => tx`select id from reservation_requests`)).rejects.toMatchObject({ code: "42501" });
  await expect(asUser(users[0], (tx) => tx`insert into vehicles(id) values (${crypto.randomUUID()})`)).rejects.toMatchObject({ code: "42501" });
});
it("fronteira privada e wrapper têm search_path fixo, owner confiável e PUBLIC revogado", async () => {
  const functions = await admin`select n.nspname,p.prosecdef,p.proconfig,r.rolsuper,r.rolbypassrls,
    exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
    where (n.nspname='fleet_private' and p.proname='create_vehicle') or (n.nspname='public' and p.proname='create_fleet_vehicle')`;
  expect(functions).toHaveLength(2);
  for (const fn of functions) { expect(fn.proconfig).toContain('search_path=""'); expect(fn.prosecdef).toBe(fn.nspname === "fleet_private"); expect(fn.rolsuper || fn.rolbypassrls).toBe(true); expect(fn.public_execute).toBe(false); }
});
