import { execFile } from "node:child_process";
import { promisify } from "node:util";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";
import { developmentSeedFixture } from "../../scripts/development_seed_fixture.mjs";

const execFileAsync = promisify(execFile);
const externalOrganization = {
  id: "30000000-0000-4000-8000-000000000001",
  name: "Organização externa sintética",
  slug: "organizacao_externa_sintetica",
};
const externalVehicleId = "30000000-0000-4000-8000-000000000002";

describe("fixture local em PostgreSQL", () => {
  let sql: ReturnType<typeof postgres>;
  let testDatabaseUrl: string;
  let testDatabaseName: string;

  beforeAll(async () => {
    ({ testDatabaseUrl, testDatabaseName } = parseTestDatabaseEnvironment(process.env));
    sql = postgres(testDatabaseUrl, { max: 1 });
    await sql`delete from vehicles where id in ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004')`;
    await sql`delete from organizations where id = '10000000-0000-4000-8000-000000000001' or slug = 'locadora_demonstrativa'`;
    await sql`delete from vehicles where id = ${externalVehicleId}`;
    await sql`delete from organizations where id = ${externalOrganization.id}`;
    await sql`insert into organizations (id, name, slug) values (${externalOrganization.id}, ${externalOrganization.name}, ${externalOrganization.slug})`;
    await sql`insert into vehicles (id, organization_id, brand, model, version, year, color, weekly_price_cents, status, is_demo) values (${externalVehicleId}, ${externalOrganization.id}, 'Marca externa', 'Modelo externo', null, 2020, 'Azul', 50000, 'maintenance', false)`;
  });

  afterAll(async () => {
    if (sql) {
      await sql`delete from vehicles where id in ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004')`;
      await sql`delete from organizations where id = '10000000-0000-4000-8000-000000000001' or slug = 'locadora_demonstrativa'`;
      await sql`delete from vehicles where id = ${externalVehicleId}`;
      await sql`delete from organizations where id = ${externalOrganization.id}`;
      await sql.end();
    }
  });

  it("duas execuções convergem para a fixture exata e preservam registros externos", async () => {
    const runSeed = () => execFileAsync(process.execPath, ["scripts/seed_development.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testDatabaseUrl, POSTGRES_DB: testDatabaseName },
    });
    await expect(runSeed()).resolves.toMatchObject({ stdout: expect.stringContaining("Fixture de desenvolvimento local provisionada") });
    await expect(runSeed()).resolves.toMatchObject({ stdout: expect.stringContaining("Fixture de desenvolvimento local provisionada") });

    const organizations = await sql`select id::text, name, slug from organizations where id = ${developmentSeedFixture.organization.id}`;
    const vehicles = await sql`
      select id::text, organization_id::text as "organizationId", brand, model, version, year,
             color, weekly_price_cents as "weeklyPriceCents", status, is_demo as "isDemo"
      from vehicles where organization_id = ${developmentSeedFixture.organization.id} order by id
    `;
    expect(organizations).toEqual([{ ...developmentSeedFixture.organization }]);
    expect(vehicles).toEqual(developmentSeedFixture.vehicles.map((vehicle) => ({ ...vehicle })));

    const [externalOrganizationAfter] = await sql`select id::text, name, slug from organizations where id = ${externalOrganization.id}`;
    const [externalVehicleAfter] = await sql`select id::text, status, is_demo as "isDemo" from vehicles where id = ${externalVehicleId}`;
    expect(externalOrganizationAfter).toEqual(externalOrganization);
    expect(externalVehicleAfter).toEqual({ id: externalVehicleId, status: "maintenance", isDemo: false });
  });
});
