import { execFile } from "node:child_process";
import { promisify } from "node:util";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";
import { developmentSeedFixture } from "../../scripts/development_seed_fixture.mjs";

const execFileAsync = promisify(execFile);

describe("fixture local em PostgreSQL", () => {
  let sql: ReturnType<typeof postgres>;
  let testDatabaseUrl: string;
  let testDatabaseName: string;

  beforeAll(async () => {
    ({ testDatabaseUrl, testDatabaseName } = parseTestDatabaseEnvironment(process.env));
    sql = postgres(testDatabaseUrl, { max: 1 });
    await sql`delete from vehicles where id in ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004')`;
    await sql`delete from organizations where id = '10000000-0000-4000-8000-000000000001' or slug = 'locadora_demonstrativa'`;
  });

  afterAll(async () => {
    if (sql) {
      await sql`delete from vehicles where id in ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004')`;
      await sql`delete from organizations where id = '10000000-0000-4000-8000-000000000001' or slug = 'locadora_demonstrativa'`;
      await sql.end();
    }
  });

  it("provisiona a fixture exata em banco vazio após as migrations", async () => {
    await expect(execFileAsync(process.execPath, ["scripts/seed_development.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testDatabaseUrl, POSTGRES_DB: testDatabaseName },
    })).resolves.toMatchObject({ stdout: expect.stringContaining("Fixture de desenvolvimento local provisionada") });

    const organizations = await sql`select id::text, name, slug from organizations where id = ${developmentSeedFixture.organization.id}`;
    const vehicles = await sql`
      select id::text, organization_id::text as "organizationId", brand, model, version, year,
             color, weekly_price_cents as "weeklyPriceCents", status, is_demo as "isDemo"
      from vehicles where organization_id = ${developmentSeedFixture.organization.id} order by id
    `;
    expect(organizations).toEqual([{ ...developmentSeedFixture.organization }]);
    expect(vehicles).toEqual(developmentSeedFixture.vehicles.map((vehicle) => ({ ...vehicle })));
  });
});
