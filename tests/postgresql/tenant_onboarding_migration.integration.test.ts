import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { idx: number; tag: string }[] };
const migration = readFileSync("drizzle/0011_tenant_onboarding.sql", "utf8").replaceAll("--> statement-breakpoint", "");
const organizations = [crypto.randomUUID(), crypto.randomUUID()];
const users = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
const createdAt = "2026-01-01T12:00:00.000Z";
let admin: ReturnType<typeof postgres>;
let isolated: ReturnType<typeof postgres>;
let databaseName: string;

beforeAll(async () => {
  const { testDatabaseUrl } = parseTestDatabaseEnvironment(process.env);
  const url = new URL(testDatabaseUrl);
  url.pathname = "/postgres";
  admin = postgres(url.href, { max: 1 });
  databaseName = `onboarding_${crypto.randomUUID().replaceAll("-", "")}_test`;
  await admin.unsafe(`CREATE DATABASE "${databaseName}"`).simple();
  url.pathname = `/${databaseName}`;
  isolated = postgres(url.href, { max: 1 });
  for (const entry of journal.entries.filter(({ idx }) => idx < 11)) {
    await isolated.unsafe(readFileSync(`drizzle/${entry.tag}.sql`, "utf8").replaceAll("--> statement-breakpoint", "")).simple();
  }
  for (const id of organizations) {
    await isolated`insert into organizations(id, name, slug) values (${id}, 'Locadora legada sintética', ${`legacy-${id}`})`;
  }
  for (const [index, user] of users.entries()) {
    await isolated`insert into organization_memberships(user_id, organization_id, created_at)
      values (${user}, ${organizations[index % 2]}, ${createdAt})`;
  }
  // Execute the complete migration, including its security boundary, in one transaction.
  await isolated.begin(async (tx) => { await tx.unsafe(migration).simple(); });
}, 30000);

afterAll(async () => {
  if (isolated) await isolated.end();
  if (admin && databaseName) {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`).simple();
    await admin.end();
  }
});

it("0011 promove todos os memberships legados para owner sem mudar identidade, organização ou data", async () => {
  for (const [index, user] of users.entries()) {
    const [row] = await isolated`select user_id, organization_id, created_at, role from organization_memberships where user_id = ${user}`;
    expect(row).toEqual({ user_id: user, organization_id: organizations[index % 2], created_at: new Date(createdAt), role: "owner" });
  }
  expect((await isolated`select count(*)::int as count from organization_memberships`)[0].count).toBe(3);
});

it("0011 mantém default member para inserts futuros e owner explícito para onboarding", async () => {
  const futureMember = crypto.randomUUID();
  await isolated`insert into organization_memberships(user_id, organization_id) values (${futureMember}, ${organizations[0]})`;
  expect((await isolated`select role from organization_memberships where user_id = ${futureMember}`)[0].role).toBe("member");
  const [column] = await isolated`select column_default, is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'organization_memberships' and column_name = 'role'`;
  expect(column).toEqual({ column_default: "'member'::text", is_nullable: "NO" });
  const owner = crypto.randomUUID();
  await isolated.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: owner, is_anonymous: false })}, true)`;
    await tx`set local role authenticated`;
    await tx`select public.create_initial_organization(${crypto.randomUUID()}::uuid, 'Nova locadora', ${`new-${owner}`},
      'Cidade sintética', 'Controlador sintético', 'Privacidade', 'https://example.test/privacidade')`;
  });
  expect((await isolated`select role from organization_memberships where user_id = ${owner}`)[0].role).toBe("owner");
  expect((await isolated`select role from organization_memberships where user_id = ${futureMember}`)[0].role).toBe("member");
});

it("owner legado conserva leitura isolada e não cria segunda locadora", async () => {
  await isolated.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: users[0], is_anonymous: false })}, true)`;
    await tx`set local role authenticated`;
    expect(await tx`select id from organizations`).toEqual([{ id: organizations[0] }]);
  });
  await expect(isolated.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: users[0], is_anonymous: false })}, true)`;
    await tx`set local role authenticated`;
    await tx`select public.create_initial_organization(${crypto.randomUUID()}::uuid, 'Tentativa', 'segunda-locadora',
      'Cidade sintética', 'Controlador sintético', 'Privacidade', 'mailto:privacy@example.test')`;
  })).rejects.toMatchObject({ code: "P2003" });
});
