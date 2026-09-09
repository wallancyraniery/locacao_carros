import postgres from "postgres";
import { developmentSeedFixture, DevelopmentSeedError, provisionDevelopmentSeed } from "./development_seed_fixture.mjs";

const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function safeDevelopmentUrl(environment) {
  if (!environment.DATABASE_URL || !environment.POSTGRES_DB) throw new Error("Configuração local de desenvolvimento incompleta.");
  let url;
  try { url = new URL(environment.DATABASE_URL); } catch { throw new Error("Configuração local de desenvolvimento inválida."); }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!localHosts.has(url.hostname.toLowerCase()) || databaseName !== environment.POSTGRES_DB) throw new Error("Seed recusado: o destino deve ser o banco PostgreSQL local configurado.");
  return url.href;
}

const sql = postgres(safeDevelopmentUrl(process.env), { max: 1 });

try {
  await sql.begin(async (transaction) => {
    const adapter = {
      async validateStructure() {
        const rows = await transaction`
          SELECT table_name AS "tableName", column_name AS "columnName"
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name IN ('organizations', 'vehicles')
        `;
        const columns = new Set(rows.map(({ tableName, columnName }) => `${tableName}.${columnName}`));
        const required = [
          "organizations.id", "organizations.name", "organizations.slug",
          "vehicles.id", "vehicles.organization_id", "vehicles.brand", "vehicles.model",
          "vehicles.version", "vehicles.year", "vehicles.color", "vehicles.weekly_price_cents",
          "vehicles.status", "vehicles.is_demo",
        ];
        if (required.some((column) => !columns.has(column))) throw new DevelopmentSeedError("SCHEMA_MISSING");
      },
      async readFixtureState() {
        const { organization, vehicles: fixtureVehicles } = developmentSeedFixture;
        const organizations = await transaction`
          SELECT id::text, name, slug FROM organizations
          WHERE id = ${organization.id} OR slug = ${organization.slug}
        `;
        const vehicles = await transaction`
          SELECT id::text, organization_id::text AS "organizationId", brand, model, version,
                 year, color, weekly_price_cents AS "weeklyPriceCents", status, is_demo AS "isDemo"
          FROM vehicles
          WHERE id IN ${transaction(fixtureVehicles.map(({ id }) => id))}
        `;
        return { organizations, vehicles };
      },
      async insertMissing(plan, fixture) {
        if (plan.insertOrganization) {
          const organization = fixture.organization;
          await transaction`INSERT INTO organizations (id, name, slug) VALUES (${organization.id}, ${organization.name}, ${organization.slug})`;
        }
        for (const vehicle of plan.vehiclesToInsert) {
          await transaction`
            INSERT INTO vehicles (id, organization_id, brand, model, version, year, color, weekly_price_cents, status, is_demo)
            VALUES (${vehicle.id}, ${vehicle.organizationId}, ${vehicle.brand}, ${vehicle.model}, ${vehicle.version}, ${vehicle.year}, ${vehicle.color}, ${vehicle.weeklyPriceCents}, ${vehicle.status}, ${vehicle.isDemo})
          `;
        }
      },
    };
    await provisionDevelopmentSeed(adapter);
  });
  console.log("Fixture de desenvolvimento local provisionada com segurança.");
} catch (error) {
  console.error(error instanceof DevelopmentSeedError ? error.message : "Não foi possível provisionar a fixture de desenvolvimento local.");
  process.exitCode = 1;
} finally {
  await sql.end();
}
