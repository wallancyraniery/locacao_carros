import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";

let admin: ReturnType<typeof postgres>;
let api: ReturnType<typeof postgres>;
let concurrent: ReturnType<typeof postgres>;
let users: string[];
let slugs: string[];
let input: ReturnType<typeof data>;
function data() {
  const slug = `onboarding-${crypto.randomUUID()}`;
  slugs.push(slug);
  return { operation: crypto.randomUUID(), name: "Locadora Sintética", slug, city: "Cidade Sintética",
    controller: "Controlador Sintético", label: "Privacidade", url: "https://example.test/privacidade" };
}
const call = (sql: postgres.TransactionSql, value = input) => sql`
  select public.create_initial_organization(${value.operation}::uuid, ${value.name}, ${value.slug}, ${value.city},
    ${value.controller}, ${value.label}, ${value.url})::text as id`;
async function asUser<T>(user: string | null, run: (tx: postgres.TransactionSql) => Promise<T>,
  extra = {}, client = api, role = "authenticated") {
  return client.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user, ...extra })}, true)`;
    await tx.unsafe(`set local role ${role}`);
    return run(tx);
  });
}
const counts = async () => (await admin`select
  (select count(*)::int from organizations where slug = any(${slugs}::text[])) as organizations,
  (select count(*)::int from organization_memberships where user_id = any(${users}::uuid[])) as memberships,
  (select count(*)::int from onboarding_private.initial_organizations where user_id = any(${users}::uuid[])) as receipts`)[0];
beforeAll(() => {
  const url = parseTestDatabaseEnvironment(process.env).testDatabaseUrl;
  admin = postgres(url, { max: 1 }); api = postgres(url, { max: 1 }); concurrent = postgres(url, { max: 1 });
});
beforeEach(() => { users = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]; slugs = []; input = data(); });
afterEach(async () => {
  await admin`delete from organization_memberships where user_id = any(${users}::uuid[])`;
  await admin`delete from onboarding_private.initial_organizations where user_id = any(${users}::uuid[])`;
  await admin`delete from organizations where slug = any(${slugs}::text[])`;
});
afterAll(async () => { await Promise.all([admin.end(), api.end(), concurrent.end()]); });

it("cria organização completa e owner da identidade autenticada, ignorando metadata forjada", async () => {
  const [receipt] = await asUser(users[0], (tx) => call(tx), { user_metadata: { user_id: users[1], role: "owner" } });
  expect(await counts()).toEqual({ organizations: 1, memberships: 1, receipts: 1 });
  expect(await admin`select user_id, organization_id, role from organization_memberships where user_id = any(${users}::uuid[])`)
    .toEqual([{ user_id: users[0], organization_id: receipt.id, role: "owner" }]);
  expect(await admin`select name, slug, city, data_controller, privacy_channel_label, privacy_channel_url from organizations where id = ${receipt.id}`)
    .toEqual([{ name: input.name, slug: input.slug, city: input.city, data_controller: input.controller, privacy_channel_label: input.label, privacy_channel_url: input.url }]);
});
it("retry sequencial retorna o mesmo recibo e cria 1/1/1", async () => {
  const first = await asUser(users[0], (tx) => call(tx));
  expect(await asUser(users[0], (tx) => call(tx))).toEqual(first);
  expect(await counts()).toEqual({ organizations: 1, memberships: 1, receipts: 1 });
});
it("retry concorrente retorna o mesmo recibo e cria 1/1/1", async () => {
  const [first, second] = await Promise.all([asUser(users[0], (tx) => call(tx)), asUser(users[0], (tx) => call(tx), {}, concurrent)]);
  expect(first).toEqual(second);
  expect(await counts()).toEqual({ organizations: 1, memberships: 1, receipts: 1 });
});
it("duas operações concorrentes da mesma identidade não criam duas locadoras", async () => {
  const another = data();
  const result = await Promise.allSettled([asUser(users[0], (tx) => call(tx)), asUser(users[0], (tx) => call(tx, another), {}, concurrent)]);
  expect(result.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(result.find(({ status }) => status === "rejected")).toMatchObject({ reason: { code: "P2003" } });
  expect(await counts()).toEqual({ organizations: 1, memberships: 1, receipts: 1 });
});
it("mesma operação com dados diferentes não modifica o cadastro original", async () => {
  await asUser(users[0], (tx) => call(tx));
  await expect(asUser(users[0], (tx) => call(tx, { ...input, city: "Outra cidade" }))).rejects.toMatchObject({ code: "P2003" });
  expect((await admin`select city from organizations where slug = ${input.slug}`)[0].city).toBe(input.city);
});
it("membership preexistente mantém acesso e não pode criar outra organização", async () => {
  const id = crypto.randomUUID();
  await admin`insert into organizations(id, name, slug) values (${id}, 'Legada', ${input.slug})`;
  await admin`insert into organization_memberships(user_id, organization_id) values (${users[0]}, ${id})`;
  await expect(asUser(users[0], (tx) => call(tx, data()))).rejects.toMatchObject({ code: "P2003" });
  expect(await asUser(users[0], (tx) => tx`select id from organizations`)).toEqual([{ id }]);
  expect(await counts()).toEqual({ organizations: 1, memberships: 1, receipts: 0 });
});
it("revogação não é desfeita por retry nem permite novo cadastro inicial", async () => {
  await asUser(users[0], (tx) => call(tx));
  await admin`delete from organization_memberships where user_id = ${users[0]}`;
  await expect(asUser(users[0], (tx) => call(tx))).rejects.toMatchObject({ code: "P2003" });
  await expect(asUser(users[0], (tx) => call(tx, data()))).rejects.toMatchObject({ code: "P2003" });
  expect(await counts()).toEqual({ organizations: 1, memberships: 0, receipts: 1 });
});
it.each(["ABCD", "ab", "com espaço", "-locadora", "locadora-", "locadora--nova", "x".repeat(64)])("recusa slug inválido %s sem escrita", async (slug) => {
  await expect(asUser(users[0], (tx) => call(tx, { ...input, slug }))).rejects.toMatchObject({ code: "P2001" });
  expect(await counts()).toEqual({ organizations: 0, memberships: 0, receipts: 0 });
});
it.each(["javascript:alert(1)", "http://example.test", "https://user:secret@example.test", "https://example.test\n"])("recusa canal inseguro %s", async (url) => {
  await expect(asUser(users[0], (tx) => call(tx, { ...input, url }))).rejects.toMatchObject({ code: "P2001" });
});
it("aceita canal mailto e recusa nome/cidade/controlador/canal ausentes", async () => {
  for (const field of ["name", "city", "controller", "label", "url"] as const) {
    await expect(asUser(users[0], (tx) => call(tx, { ...input, [field]: "" }))).rejects.toMatchObject({ code: "P2001" });
  }
  await asUser(users[0], (tx) => call(tx, { ...input, url: "mailto:privacidade@example.test" }));
  expect(await counts()).toEqual({ organizations: 1, memberships: 1, receipts: 1 });
});
it("slug duplicado falha sem organização ou membership parcial", async () => {
  await asUser(users[0], (tx) => call(tx));
  await expect(asUser(users[1], (tx) => call(tx))).rejects.toMatchObject({ code: "P2002" });
  expect(await counts()).toEqual({ organizations: 1, memberships: 1, receipts: 1 });
});
it("erro no membership reverte também a organização", async () => {
  await admin.unsafe(`create function onboarding_private.test_fail_membership() returns trigger language plpgsql as $$
    begin if new.user_id = '${users[0]}'::uuid then raise exception 'synthetic failure'; end if; return new; end; $$`);
  await admin`create trigger onboarding_test_failure before insert on organization_memberships for each row execute function onboarding_private.test_fail_membership()`;
  try {
    await expect(asUser(users[0], (tx) => call(tx))).rejects.toMatchObject({ code: "P0001" });
    expect(await counts()).toEqual({ organizations: 0, memberships: 0, receipts: 0 });
  } finally {
    await admin`drop trigger onboarding_test_failure on organization_memberships`;
    await admin`drop function onboarding_private.test_fail_membership()`;
  }
});
it.each([null, "not-a-uuid"])("recusa identidade ausente ou inválida %s", async (user) => {
  await expect(asUser(user, (tx) => call(tx))).rejects.toMatchObject({ code: "42501" });
});
it("recusa Auth anônimo apesar da role authenticated", async () => {
  await expect(asUser(users[0], (tx) => call(tx), { is_anonymous: true })).rejects.toMatchObject({ code: "42501" });
});
it.each(["anon", "lead_intake_runtime"])("role %s não executa a fronteira mesmo com claims", async (role) => {
  await expect(asUser(users[0], (tx) => call(tx), {}, api, role)).rejects.toMatchObject({ code: "42501" });
});
it("RLS isola organizações e memberships, inclusive diante de policy permissiva", async () => {
  const [a] = await asUser(users[0], (tx) => call(tx));
  const [b] = await asUser(users[1], (tx) => call(tx, data()));
  await admin`create policy onboarding_test_broad on organizations for select to authenticated using (true)`;
  try {
    expect(await asUser(users[0], (tx) => tx`select id from organizations`)).toEqual([{ id: a.id }]);
    expect(await asUser(users[0], (tx) => tx`select id from organizations where id = ${b.id}`)).toEqual([]);
    expect(await asUser(users[2], (tx) => tx`select id from organizations`)).toEqual([]);
    expect(await asUser(users[0], (tx) => tx`select user_id from organization_memberships`)).toEqual([{ user_id: users[0] }]);
  } finally { await admin`drop policy onboarding_test_broad on organizations`; }
});
it("não concede escrita direta nem leitura do recibo privado", async () => {
  await expect(asUser(users[0], (tx) => tx`insert into organizations(name, slug) values ('Tentativa', 'tentativa')`)).rejects.toMatchObject({ code: "42501" });
  await expect(asUser(users[0], (tx) => tx`insert into organization_memberships(user_id, organization_id, role) values (${users[1]}, ${crypto.randomUUID()}, 'owner')`)).rejects.toMatchObject({ code: "42501" });
  await expect(asUser(users[0], (tx) => tx`select * from onboarding_private.initial_organizations`)).rejects.toMatchObject({ code: "42501" });
  for (const table of ["organizations", "organization_memberships"]) {
    for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "TRIGGER"]) {
      expect((await admin`select has_table_privilege('authenticated', ${table}, ${privilege}) as allowed`)[0].allowed).toBe(false);
    }
  }
});
it("fronteira privada tem owner confiável, search_path fixo e adaptador invoker", async () => {
  const functions = await admin`select n.nspname, p.prosecdef, p.proconfig, r.rolname, r.rolsuper, r.rolbypassrls
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
    where p.proname='create_initial_organization' order by n.nspname`;
  expect(functions).toHaveLength(2);
  for (const fn of functions) {
    expect(fn.proconfig).toContain('search_path=""');
    expect(["anon", "authenticated", "lead_intake_runtime"]).not.toContain(fn.rolname);
    expect(fn.rolsuper || fn.rolbypassrls).toBe(true);
    expect(fn.prosecdef).toBe(fn.nspname === "onboarding_private");
  }
});
