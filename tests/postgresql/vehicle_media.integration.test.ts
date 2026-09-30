import postgres from "postgres";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";
let db: ReturnType<typeof postgres>;
const orgs = [crypto.randomUUID(), crypto.randomUUID()];
const owners = orgs.map(() => crypto.randomUUID());
const member = crypto.randomUUID();
const vehicles = orgs.map(() => crypto.randomUUID());
const slugs = orgs.map((id) => `media-${id}`);
async function asOwner<T>(actor: string | null, callback: (tx: postgres.TransactionSql) => Promise<T>, extra = {}) {
  return db.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actor, ...extra })}, true)`;
    await tx`set local role authenticated`;
    return callback(tx);
  });
}
async function prepare(actor = owners[0], vehicle = vehicles[0], operation = crypto.randomUUID()) {
  return asOwner(actor, async (tx) => (await tx`select public.prepare_vehicle_media(${vehicle}::uuid,${operation}::uuid,'image/png',100) as image`)[0].image);
}
async function finish(image: string, remove = false, actor = owners[0], vehicle = vehicles[0]) {
  return db.begin(async (tx) => {
    await tx`set local role lead_intake_runtime`;
    await tx`select vehicle_media_private.finish(${actor}::uuid,${vehicle}::uuid,${image}::uuid,${remove},800,600)`;
  });
}
async function remove(image: string, actor = owners[0], vehicle = vehicles[0]) {
  return asOwner(actor, async (tx) => (await tx`select public.delete_vehicle_media(${vehicle}::uuid,${image}::uuid) as image`)[0].image);
}
async function lookup(slug = slugs[0], vehicle: string | null = null) {
  return db.begin(async (tx) => {
    await tx`set local role anon`;
    return vehicle ? (await tx`select public.lookup_tenant_storefront_vehicle(${slug},${vehicle}::uuid) as data`)[0].data
      : (await tx`select public.lookup_tenant_storefront_media(${slug}) as data`)[0].data;
  });
}
async function resetImages() {
  await db`delete from vehicle_media_private.preparations where vehicle_id=any(${vehicles}::uuid[])`;
  await db`delete from vehicle_images where vehicle_id=any(${vehicles}::uuid[])`;
}
beforeAll(async () => {
  db = postgres(parseTestDatabaseEnvironment(process.env).testDatabaseUrl, { max: 12 });
  for (const [i, org] of orgs.entries()) {
    await db`insert into organizations(id,name,slug,storefront_status) values(${org},'Locadora sintética',${slugs[i]},'published')`;
    await db`insert into organization_memberships(user_id,organization_id,role) values(${owners[i]},${org},'owner')`;
    await db`insert into vehicles(id,organization_id,brand,model,year,color,weekly_price_cents,status,operational_status,is_demo)
      values(${vehicles[i]},${org},'Marca','Modelo',2025,'Prata',100,'available','active',false)`;
  }
  await db`insert into organization_memberships(user_id,organization_id,role) values(${member},${orgs[0]},'member')`;
});
afterAll(async () => {
  if (!db) return;
  await resetImages();
  await db`delete from vehicles where id=any(${vehicles}::uuid[])`;
  await db`delete from organization_memberships where organization_id=any(${orgs}::uuid[])`;
  await db`delete from organizations where id=any(${orgs}::uuid[])`;
  await db.end();
});
it("limite de oito é atômico sob dez preparações concorrentes e retry não ocupa outro slot", async () => {
  try {
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => prepare()));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(8);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2);
    expect((await db`select count(*)::int as count from vehicle_images where vehicle_id=${vehicles[0]}`)[0].count).toBe(8);
  } finally { await resetImages(); }
  const operation = crypto.randomUUID();
  const results = await Promise.all([prepare(owners[0],vehicles[0],operation),prepare(owners[0],vehicles[0],operation)]);
  expect(results[0].id).toBe(results[1].id);
  expect(results[0].id).not.toBe(operation);
  expect(results[0].storage_path).toBe(`${orgs[0]}/${vehicles[0]}/${results[0].id}.png`);
  await resetImages();
});
it("member, Auth anônimo e owner A não administram B; claims editáveis não concedem acesso", async () => {
  const b = await prepare(owners[1],vehicles[1]);
  try {
    for (const actor of [member, owners[0], crypto.randomUUID()]) {
      await expect(prepare(actor,vehicles[1])).rejects.toMatchObject({ code: '42501' });
      await expect(remove(b.id,actor,vehicles[1])).rejects.toMatchObject({ code: '42501' });
      await expect(asOwner(actor, async (tx) => tx`select public.list_vehicle_media(${vehicles[1]}::uuid)`)).rejects.toMatchObject({ code: '42501' });
      await expect(asOwner(actor, async (tx) => tx`select public.reorder_vehicle_media(${vehicles[1]}::uuid,'{}'::uuid[])`)).rejects.toMatchObject({ code: '42501' });
    }
    await expect(asOwner(owners[0], async (tx) => tx`select public.list_vehicle_media(${vehicles[0]}::uuid)`, { is_anonymous: true })).rejects.toMatchObject({ code: '42501' });
    await expect(asOwner(member, async (tx) => tx`select public.list_vehicle_media(${vehicles[0]}::uuid)`, { user_metadata: { role: 'owner' } })).rejects.toMatchObject({ code: '42501' });
    await expect(finish(b.id,false,owners[0],vehicles[1])).rejects.toMatchObject({ code: '42501' });
  } finally { await resetImages(); }
});
it("ready exige runtime, ordem completa define capa e remoção desaparece antes da limpeza", async () => {
  const first=await prepare(); const second=await prepare();
  try {
    expect((await lookup()).vehicles[0].images).toEqual([]);
    await expect(asOwner(owners[0],async (tx)=>tx`select vehicle_media_private.finish(${owners[0]}::uuid,${vehicles[0]}::uuid,${first.id}::uuid,false,800,600)`)).rejects.toMatchObject({code:'42501'});
    await finish(first.id); await finish(first.id); await finish(second.id);
    const order=[second.id,first.id];
    await asOwner(owners[0],async(tx)=>tx`select public.reorder_vehicle_media(${vehicles[0]}::uuid,${order}::uuid[])`);
    expect((await lookup()).vehicles[0].images.map((i:{id:string})=>i.id)).toEqual(order);
    await expect(asOwner(owners[0],async(tx)=>tx`select public.reorder_vehicle_media(${vehicles[0]}::uuid,${[first.id,first.id]}::uuid[])`)).rejects.toMatchObject({code:'22023'});
    expect((await remove(second.id)).status).toBe('deleting');
    expect((await lookup()).vehicles[0].images).toMatchObject([{id:first.id,position:0}]);
    expect((await remove(second.id)).status).toBe('deleting');
    await expect(finish(second.id)).rejects.toMatchObject({code:'22023'});
    await finish(second.id,true); await finish(second.id,true);
    expect((await remove(second.id)).status).toBe('deleted');
  } finally { await resetImages(); }
});
it("projeção e predicates Storage falham fechado por tenant, estado e publicação", async () => {
  const image=await prepare();
  const allowed=async(operation:string,actor=owners[0])=>asOwner(actor,async(tx)=>(await tx`select vehicle_media_private.storage_allowed(${image.storage_path},${operation}) as allowed`)[0].allowed);
  try {
    expect(await allowed('insert')).toBe(true); expect(await allowed('insert',owners[1])).toBe(false);
    expect(await allowed('read',member)).toBe(false); expect(await allowed('public_read')).toBe(false);
    await finish(image.id);
    expect(await allowed('insert')).toBe(false); expect(await allowed('delete')).toBe(false); expect(await allowed('public_read')).toBe(true);
    expect(await lookup(slugs[1],vehicles[0])).toBeNull();
    for (const field of ['is_demo','operational_status','status']) {
      if(field==='is_demo') await db`update vehicles set is_demo=true where id=${vehicles[0]}`;
      if(field==='operational_status') await db`update vehicles set operational_status='inactive' where id=${vehicles[0]}`;
      if(field==='status') await db`update vehicles set status='maintenance' where id=${vehicles[0]}`;
      expect(await lookup(slugs[0],vehicles[0])).toBeNull(); expect(await allowed('public_read')).toBe(false);
      await db`update vehicles set is_demo=false,operational_status='active',status='available' where id=${vehicles[0]}`;
    }
    await db`update organizations set storefront_status='draft' where id=${orgs[0]}`;
    expect(await lookup()).toBeNull(); expect(await allowed('public_read')).toBe(false);
    await remove(image.id); expect(await allowed('delete')).toBe(true); expect(await allowed('public_read')).toBe(false);
    await finish(image.id,true); expect(await allowed('read')).toBe(false); expect(await allowed('insert')).toBe(false);
  } finally { await db`update organizations set storefront_status='published' where id=${orgs[0]}`; await resetImages(); }
});
it("expiração conserva slots em deleting até confirmação; retry é idempotente e não publica", async () => {
  const images = await Promise.all(Array.from({ length: 8 }, () => prepare()));
  const image = images[0];
  try {
    await db`update vehicle_images set expires_at=now()-interval '1 second' where vehicle_id=${vehicles[0]}`;
    await expect(finish(image.id)).rejects.toMatchObject({code:'22023'});
    const listed = await asOwner(owners[0], async (tx) =>
      (await tx`select public.list_vehicle_media(${vehicles[0]}::uuid) as images`)[0].images);
    expect(listed).toHaveLength(8);
    expect(listed.every((item: { status: string; expires_at: string | null }) => item.status === 'deleting' && item.expires_at === null)).toBe(true);
    expect((await lookup()).vehicles[0].images).toEqual([]);
    const permissions = await asOwner(owners[0], async (tx) => (await tx`
      select vehicle_media_private.storage_allowed(${image.storage_path},'delete') as removable,
             vehicle_media_private.storage_allowed(${image.storage_path},'insert') as uploadable,
             vehicle_media_private.storage_allowed(${image.storage_path},'public_read') as public_read`)[0]);
    expect(permissions).toMatchObject({ removable: true, uploadable: false, public_read: false });
    await expect(prepare()).rejects.toMatchObject({code:'22023'});
    expect((await remove(image.id)).status).toBe('deleting');
    expect((await remove(image.id)).status).toBe('deleting');
    await expect(finish(image.id)).rejects.toMatchObject({code:'22023'});
    // This runtime attestation follows Storage API confirmation in the action;
    // actual-object and transient-failure sequencing are covered by action tests.
    await finish(image.id,true);
    await finish(image.id,true);
    const next = await prepare();
    expect(next.storage_path).not.toBe(image.storage_path);
    expect((await db`select status from vehicle_images where id=${image.id}`)[0].status).toBe('deleted');
    expect((await lookup()).vehicles[0].images).toEqual([]);
    await expect(db`update vehicle_images set organization_id=${orgs[1]} where id=${next.id}`).rejects.toMatchObject({code:'23503'});
  } finally { await resetImages(); }
});
it("nenhuma role de aplicação tem acesso direto; funções privadas não têm EXECUTE público", async () => {
  for(const role of ['anon','authenticated','lead_intake_runtime']) {
    expect((await db`select has_table_privilege(${role},'public.vehicle_images','SELECT,INSERT,UPDATE,DELETE') as allowed`)[0].allowed).toBe(false);
    await expect(db.begin(async(tx)=>{await tx.unsafe(`set local role ${role}`);await tx`select * from public.vehicle_images`;})).rejects.toMatchObject({code:'42501'});
  }
  expect((await db`select relrowsecurity from pg_class where oid='public.vehicle_images'::regclass`)[0].relrowsecurity).toBe(true);
  const fns=await db`select p.proname,p.proconfig,p.prosecdef,exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='vehicle_media_private'`;
  expect(fns.length).toBeGreaterThan(5);
  for(const fn of fns){expect(fn.proconfig).toContain('search_path=""');expect(fn.prosecdef).toBe(fn.proname !== 'safe_upload_request');expect(fn.public_execute).toBe(false);}
});

it("Storage policies negam emissão por usuário sem depender de contexto HTTP", async () => {
  const image=await prepare();
  try {
    expect((await db`select to_regclass('storage.objects') as name`)[0].name).toBeNull();
    await expect(db.begin(async(tx)=>{
      await tx`create schema storage`;
      await tx`create table storage.objects (id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name))`;
      await tx`alter table storage.objects enable row level security`;
      await tx`grant usage on schema storage to anon,authenticated`;
      await tx`grant select,insert,update,delete on storage.objects to anon,authenticated`;
      // Prove restrictive guards remain closed even with an unrelated broad policy.
      await tx`create policy synthetic_broad_policy on storage.objects for all to anon,authenticated using(true) with check(true)`;
      const migration=readFileSync('drizzle/0014_tenant_vehicle_media.sql','utf8');
      await tx.unsafe(migration.slice(migration.lastIndexOf('DO $$ BEGIN')));
      await tx`insert into storage.objects(bucket_id,name) values('vehicle-media',${image.storage_path})`;
      await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:owners[0]})},true)`;
      await tx`set local role authenticated`;
      await expect(tx.savepoint(async(sp)=>sp`insert into storage.objects(bucket_id,name) values('vehicle-media',${image.storage_path}) on conflict(bucket_id,name) do update set name=excluded.name`)).rejects.toMatchObject({code:'42501'});
      await expect(tx.savepoint(async(sp)=>sp`insert into storage.objects(bucket_id,name) values('vehicle-media','another-path')`)).rejects.toMatchObject({code:'42501'});
      expect(await tx`update storage.objects set name='arbitrary' where name=${image.storage_path} returning id`).toHaveLength(0);
      await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:owners[1]})},true)`;
      expect(await tx`select * from storage.objects`).toHaveLength(0);
      throw new Error('ROLLBACK_SYNTHETIC_STORAGE');
    })).rejects.toThrow('ROLLBACK_SYNTHETIC_STORAGE');
  } finally { await resetImages(); }
});
