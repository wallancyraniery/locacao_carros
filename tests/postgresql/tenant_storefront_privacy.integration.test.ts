import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";

const ids = Object.fromEntries(["a", "b", "draft", "eligible", "other", "inactive", "unavailable", "demo"].map((name) => [name, crypto.randomUUID()])) as Record<string, string>;
const suffix = crypto.randomUUID().slice(0, 8);
const slugA = `privacy-a-${suffix}`, slugB = `privacy-b-${suffix}`, slugDraft = `privacy-draft-${suffix}`;
let db: ReturnType<typeof postgres>;
async function privacy(slug: string, vehicle: string) {
  return db.begin(async (tx) => { await tx`set local role anon`; return (await tx`select public.lookup_tenant_storefront_interest_privacy(${slug},${vehicle}::uuid) data`)[0].data; });
}
beforeAll(async () => {
  db = postgres(parseTestDatabaseEnvironment(process.env).testDatabaseUrl, { max: 1 });
  await db`insert into organizations(id,name,slug,storefront_status,data_controller,privacy_channel_label,privacy_channel_url) values
    (${ids.a},'A',${slugA},'published','Controlador A','Canal A','mailto:privacidade@a.example.com'),
    (${ids.b},'B',${slugB},'published','Controlador B','Canal B','mailto:privacidade@b.example.com'),
    (${ids.draft},'D',${slugDraft},'draft','Controlador Draft','Canal Draft','mailto:privacidade@draft.example.com')`;
  await db`insert into vehicles(id,organization_id,brand,model,year,color,weekly_price_cents,status,operational_status,is_demo) values
    (${ids.eligible},${ids.a},'M','Elegivel',2024,'P',1,'available','active',false),
    (${ids.other},${ids.b},'M','Outro',2024,'P',1,'available','active',false),
    (${ids.inactive},${ids.a},'M','Inativo',2024,'P',1,'available','inactive',false),
    (${ids.unavailable},${ids.a},'M','Indisponivel',2024,'P',1,'rented','active',false),
    (${ids.demo},${ids.a},'M','Demo',2024,'P',1,'available','active',true)`;
});
afterAll(async () => { if (db) { await db`delete from vehicles where id=any(${Object.values(ids).slice(3)}::uuid[])`; await db`delete from organizations where id=any(${Object.values(ids).slice(0,3)}::uuid[])`; await db.end(); } });
it("anon recebe somente a privacidade pública do par published elegível", async () => {
  expect(await privacy(slugA, ids.eligible)).toEqual({ data_controller: "Controlador A", privacy_channel_label: "Canal A", privacy_channel_url: "mailto:privacidade@a.example.com" });
  expect(JSON.stringify(await privacy(slugA, ids.eligible))).not.toMatch(/organization_id|vehicle_id|Controlador B|Draft/);
});
it.each([["inválido", "../admin", ids.eligible], ["draft", slugDraft, ids.eligible], ["outro tenant", slugA, ids.other], ["inactive", slugA, ids.inactive], ["unavailable", slugA, ids.unavailable], ["demo", slugA, ids.demo]])("%s não retorna privacidade", async (_name, slug, vehicle) => { expect(await privacy(slug, vehicle)).toBeNull(); });
it("não amplia leitura direta nem execução para outras roles", async () => {
  for (const role of ["authenticated", "lead_intake_runtime"]) expect((await db`select has_function_privilege(${role}, 'public.lookup_tenant_storefront_interest_privacy(text,uuid)', 'EXECUTE') allowed`)[0].allowed).toBe(false);
  expect((await db`select has_function_privilege('anon', 'storefront_private.lookup_interest_privacy(text,uuid)', 'EXECUTE') allowed`)[0].allowed).toBe(true);
  await expect(db.begin(async (tx) => { await tx`set local role anon`; await tx`select data_controller from organizations`; })).rejects.toMatchObject({ code: "42501" });
});
