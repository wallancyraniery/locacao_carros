import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";
let db: ReturnType<typeof postgres>;
const orgs = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
const owners = orgs.map(() => crypto.randomUUID());
const member = crypto.randomUUID();
const slugs = orgs.map((id) => `public-${id}`);
async function lookup(slug: string, page = 1) {
  return db.begin(async (tx) => { await tx`set local role anon`; return (await tx`select public.lookup_tenant_storefront(${slug}, ${page}::integer) as data`)[0].data; });
}
async function setStatus(actor: string | null, status: string, extra = {}) {
  return db.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actor, ...extra })}, true)`;
    await tx`set local role authenticated`;
    return (await tx`select public.set_tenant_storefront_status(${status}) as status`)[0].status;
  });
}
beforeAll(async () => {
  db = postgres(parseTestDatabaseEnvironment(process.env).testDatabaseUrl, { max: 1 });
  for (const [i, id] of orgs.entries()) await db`insert into organizations(id,name,slug,city,data_controller,privacy_channel_url) values (${id}, ${`Locadora ${i}`}, ${slugs[i]}, 'Cidade sintética', 'PRIVATE', 'mailto:private@example.test')`;
  for (const [i, id] of orgs.entries()) {
    expect((await db`select storefront_status from organizations where id=${id}`)[0].storefront_status).toBe('draft');
    await db`insert into organization_memberships(user_id, organization_id, role) values (${owners[i]},${id},'owner')`;
    if (i < 3) await setStatus(owners[i], 'published');
  }
  await db`insert into organization_memberships(user_id, organization_id, role) values (${member},${orgs[0]},'member')`;
  for (const [i, id] of orgs.slice(0, 2).entries()) {
    for (const [demo, operational, status, model] of [[false,'active','available',`Público ${i}`], [true,'active','available','DEMO'], [false,'inactive','available','INACTIVE'], [false,'active','maintenance','MAINTENANCE'], [false,'active','rented','RENTED'], [false,'active','reserved','RESERVED'], [false,'active','inactive','LEGACY']]) {
      await db`insert into vehicles(organization_id,brand,model,year,color,weekly_price_cents,is_demo,operational_status,status) values (${id},'Marca',${String(model)},2024,'Prata',70050,${Boolean(demo)},${String(operational)},${String(status)})`;
    }
  }
});
afterAll(async () => { if (db) { await db`delete from vehicles where organization_id=any(${orgs}::uuid[])`; await db`delete from organization_memberships where organization_id=any(${orgs}::uuid[])`; await db`delete from organizations where id=any(${orgs}::uuid[])`; await db.end(); } });
it("anon resolve slug e recebe exclusivamente frota elegível daquela organização", async () => {
  for (const i of [0,1]) {
    const data = await lookup(slugs[i]);
    expect(data).toEqual({ slug: slugs[i], name: `Locadora ${i}`, city: "Cidade sintética", hasNext: false, vehicles: [{ brand: "Marca", model: `Público ${i}`, version: null, year: 2024, color: "Prata", weekly_price_cents: 70050 }] });
    expect(JSON.stringify(data)).not.toMatch(/PRIVATE|DEMO|INACTIVE|MAINTENANCE|RENTED|RESERVED|LEGACY|organization_id|privacy|@/);
  }
});
it("organização vazia existe; slug ausente ou inválido não revela dados", async () => {
  expect((await lookup(slugs[2])).vehicles).toEqual([]);
  for (const slug of ['missing-storefront', "' OR true --", orgs[0], '../admin', 'UPPER']) expect(await lookup(slug)).toBeNull();
  expect(await lookup(slugs[0], 0)).toBeNull(); expect(await lookup(slugs[0], 10001)).toBeNull();
});
it("paginação limita projeção e não mistura tenants", async () => {
  await db`insert into vehicles(organization_id,brand,model,year,color,weekly_price_cents,status,operational_status) select ${orgs[2]}::uuid,'Marca','Paginação ' || n,2024,'Prata',100,'available','active' from generate_series(1,25) n`;
  try {
    const first = await lookup(slugs[2]); const second = await lookup(slugs[2], 2);
    expect(first.vehicles).toHaveLength(24); expect(first.hasNext).toBe(true); expect(second.vehicles).toHaveLength(1); expect(second.hasNext).toBe(false);
    expect(new Set([...first.vehicles, ...second.vehicles].map((v: { model: string }) => v.model)).size).toBe(25);
  } finally { await db`delete from vehicles where organization_id=${orgs[2]}`; }
});
it("anon não ganha leitura direta nem escrita; demais roles não executam RPC", async () => {
  for (const table of ['organizations','vehicles','organization_memberships','reservation_requests']) {
    await expect(db.begin(async (tx) => { await tx`set local role anon`; await tx.unsafe(`select * from public.${table}`); })).rejects.toMatchObject({ code: '42501' });
    expect((await db`select has_table_privilege('anon', ${table}, 'INSERT,UPDATE,DELETE') as allowed`)[0].allowed).toBe(false);
  }
  for (const role of ['authenticated','lead_intake_runtime']) {
    expect((await db`select has_function_privilege(${role}, 'public.lookup_tenant_storefront(text,integer)', 'EXECUTE') as allowed`)[0].allowed).toBe(false);
    expect((await db`select has_function_privilege(${role}, 'storefront_private.lookup(text,integer)', 'EXECUTE') as allowed`)[0].allowed).toBe(false);
  }
});
it("fronteira tem owner confiável, search_path fixo, somente leitura e PUBLIC revogado", async () => {
  const functions = await db`select n.nspname,p.proname,p.prosecdef,p.proconfig,p.provolatile,r.rolsuper,r.rolbypassrls,
    exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
    where (n.nspname='storefront_private' and p.proname in ('lookup','set_status')) or (n.nspname='public' and p.proname in ('lookup_tenant_storefront','set_tenant_storefront_status'))`;
  expect(functions).toHaveLength(4);
  for (const fn of functions) { expect(fn.proconfig).toContain('search_path=""'); expect(fn.prosecdef).toBe(fn.nspname === 'storefront_private'); expect(fn.provolatile).toBe(fn.proname.startsWith('lookup') ? 's' : 'v'); expect(fn.rolsuper || fn.rolbypassrls).toBe(true); expect(fn.public_execute).toBe(false); }
});

it("draft e slug inexistente têm exatamente o mesmo resultado público", async () => {
  expect(await lookup(slugs[3])).toBeNull();
  expect(await lookup(slugs[3])).toEqual(await lookup('missing-storefront'));
});
it("owner publica/despublica somente sua locadora; retry mantém o estado e retirada é imediata", async () => {
  try {
    expect(await setStatus(owners[0], 'draft', { user_metadata: { organization_id: orgs[1], role: 'owner' } })).toBe('draft');
    expect(await lookup(slugs[0])).toBeNull(); expect((await lookup(slugs[1])).slug).toBe(slugs[1]);
    expect(await setStatus(owners[0], 'draft')).toBe('draft');
    expect(await setStatus(owners[0], 'published')).toBe('published');
    expect(await setStatus(owners[0], 'published')).toBe('published');
    expect((await lookup(slugs[0])).slug).toBe(slugs[0]);
    expect(await lookup(slugs[3])).toBeNull();
  } finally { await setStatus(owners[0], 'published'); }
});
it("member, identidade ausente, inválida e Auth anônimo não publicam", async () => {
  for (const actor of [member, null, 'invalid', crypto.randomUUID()]) {
    await expect(setStatus(actor, 'draft', { user_metadata: { role: 'owner' } })).rejects.toMatchObject({ code: '42501' });
  }
  await expect(setStatus(owners[0], 'draft', { is_anonymous: true })).rejects.toMatchObject({ code: '42501' });
  await expect(setStatus(owners[0], 'invalid')).rejects.toMatchObject({ code: '22023' });
  expect((await lookup(slugs[0])).slug).toBe(slugs[0]);
});
it("status privado obedece RLS e alteração direta permanece negada", async () => {
  await db.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: member })}, true)`;
    await tx`set local role authenticated`;
    expect(await tx`select id,storefront_status from organizations`).toEqual([{ id: orgs[0], storefront_status: 'published' }]);
  });
  await expect(db.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: owners[0] })}, true)`;
    await tx`set local role authenticated`;
    await tx`update organizations set storefront_status='published' where id=${orgs[1]}`;
  })).rejects.toMatchObject({ code: '42501' });
  for (const role of ['anon','authenticated','lead_intake_runtime']) {
    expect((await db`select has_column_privilege(${role}, 'organizations', 'storefront_status', 'UPDATE') as allowed`)[0].allowed).toBe(false);
  }
  for (const role of ['anon','lead_intake_runtime']) {
    for (const fn of ['storefront_private.set_status(text)','public.set_tenant_storefront_status(text)']) {
      expect((await db`select has_function_privilege(${role}, ${fn}, 'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    await expect(db.begin(async (tx) => { await tx.unsafe(`set local role ${role}`); await tx`select public.set_tenant_storefront_status('published')`; })).rejects.toMatchObject({ code: '42501' });
  }
});
