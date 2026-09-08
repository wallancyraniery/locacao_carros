import { createHash, X509Certificate } from "node:crypto";
import { constants } from "node:fs";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import postgres from "postgres";
import {
  authorizedLeadFlowFixture,
  LeadFlowFixtureError,
  provisionLeadFlowFixture,
} from "./supabase_lead_flow_fixture.mjs";

const expectedProjectRef = "avglmahriseqpoysdmom";
const expectedRegion = "sa-east-1";
const migrationEnvironmentFile = ".env.supabase.local";

function refuse(code) {
  throw new LeadFlowFixtureError(code);
}

function validateCertificate(contents) {
  const ca = contents.trim();
  const certificates = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!certificates || certificates.length !== 1 || certificates[0] !== ca) refuse("INVALID_CA");
  try {
    new X509Certificate(ca);
  } catch {
    refuse("INVALID_CA");
  }
  return `${ca}\n`;
}

function validateAdministrativeEnvironment(environment) {
  if (environment.SUPABASE_PROJECT_REF !== expectedProjectRef
    || environment.SUPABASE_REMOTE_MIGRATION_CONFIRMATION !== `locacao_carros:${expectedProjectRef}`) {
    refuse("PROJECT_CONFIGURATION");
  }

  let url;
  try {
    url = new URL(environment.SUPABASE_MIGRATION_DATABASE_URL);
  } catch {
    refuse("ADMINISTRATIVE_URL");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)
    || decodeURIComponent(url.username) !== `postgres.${expectedProjectRef}`
    || url.port !== "5432"
    || decodeURIComponent(url.pathname) !== "/postgres"
    || url.searchParams.get("sslmode") !== "require"
    || !new RegExp(`^aws-[0-9]+-${expectedRegion}\\.pooler\\.supabase\\.com$`).test(url.hostname)) {
    refuse("ADMINISTRATIVE_ENDPOINT");
  }
  return url;
}

async function localMigrationHistory() {
  let journal;
  try {
    journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  } catch {
    refuse("LOCAL_MIGRATION_HISTORY");
  }
  if (!Array.isArray(journal.entries) || journal.entries.length !== 4
    || journal.entries[3]?.tag !== "0003_runtime_lead_intake_access") {
    refuse("LOCAL_MIGRATION_HISTORY");
  }
  return Promise.all(journal.entries.map(async (entry, index) => {
    if (entry.idx !== index || !Number.isSafeInteger(entry.when) || typeof entry.tag !== "string") {
      refuse("LOCAL_MIGRATION_HISTORY");
    }
    const contents = await readFile(`drizzle/${entry.tag}.sql`);
    return { createdAt: String(entry.when), hash: createHash("sha256").update(contents).digest("hex") };
  }));
}

function recordsEqual(actual, expected) {
  return actual.length === expected.length
    && expected.every((item) => actual.some((candidate) => Object.entries(item)
      .every(([field, value]) => candidate[field] === value)));
}

function createAdapter(transaction, expectedMigrations) {
  return {
    async validateProject() {
      const [identity] = await transaction`SELECT current_user AS current_user`;
      if (identity?.current_user !== "postgres") refuse("PROJECT_IDENTITY");
    },
    async validateDatabase() {
      const [identity] = await transaction`SELECT current_database() AS current_database`;
      if (identity?.current_database !== "postgres") refuse("DATABASE_IDENTITY");
    },
    async validateMigrations() {
      const remote = await transaction`SELECT hash, created_at::text AS created_at
        FROM drizzle.__drizzle_migrations ORDER BY created_at`;
      const exact = remote.length === expectedMigrations.length && remote.every((row, index) => (
        row.hash === expectedMigrations[index].hash
        && row.created_at === expectedMigrations[index].createdAt
      ));
      if (!exact) refuse("MIGRATION_STATE");
    },
    async validateStructure() {
      const columns = await transaction`SELECT table_name, column_name, data_type, udt_name, is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'organizations' AND column_name IN (
              'id', 'name', 'slug', 'created_at', 'updated_at'
            ))
            OR (table_name = 'vehicles' AND column_name IN (
              'id', 'organization_id', 'brand', 'model', 'version', 'year', 'color',
              'weekly_price_cents', 'status', 'is_demo', 'created_at', 'updated_at'
            ))
          )`;
      const expectedColumns = [
        { table_name: "organizations", column_name: "id", data_type: "uuid", udt_name: "uuid", is_nullable: "NO", column_default: "gen_random_uuid()" },
        { table_name: "organizations", column_name: "name", data_type: "text", udt_name: "text", is_nullable: "NO", column_default: null },
        { table_name: "organizations", column_name: "slug", data_type: "text", udt_name: "text", is_nullable: "NO", column_default: null },
        { table_name: "organizations", column_name: "created_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO", column_default: "now()" },
        { table_name: "organizations", column_name: "updated_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO", column_default: "now()" },
        { table_name: "vehicles", column_name: "id", data_type: "uuid", udt_name: "uuid", is_nullable: "NO", column_default: "gen_random_uuid()" },
        { table_name: "vehicles", column_name: "organization_id", data_type: "uuid", udt_name: "uuid", is_nullable: "NO", column_default: null },
        { table_name: "vehicles", column_name: "brand", data_type: "text", udt_name: "text", is_nullable: "NO", column_default: null },
        { table_name: "vehicles", column_name: "model", data_type: "text", udt_name: "text", is_nullable: "NO", column_default: null },
        { table_name: "vehicles", column_name: "version", data_type: "text", udt_name: "text", is_nullable: "YES", column_default: null },
        { table_name: "vehicles", column_name: "year", data_type: "integer", udt_name: "int4", is_nullable: "NO", column_default: null },
        { table_name: "vehicles", column_name: "color", data_type: "text", udt_name: "text", is_nullable: "NO", column_default: null },
        { table_name: "vehicles", column_name: "weekly_price_cents", data_type: "integer", udt_name: "int4", is_nullable: "NO", column_default: null },
        { table_name: "vehicles", column_name: "status", data_type: "USER-DEFINED", udt_name: "vehicle_status", is_nullable: "NO", column_default: null },
        { table_name: "vehicles", column_name: "is_demo", data_type: "boolean", udt_name: "bool", is_nullable: "NO", column_default: "false" },
        { table_name: "vehicles", column_name: "created_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO", column_default: "now()" },
        { table_name: "vehicles", column_name: "updated_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO", column_default: "now()" },
      ];
      if (!recordsEqual(columns, expectedColumns)) refuse("COLUMN_STRUCTURE");

      const constraints = await transaction`SELECT conname, contype, confdeltype,
          pg_get_constraintdef(oid, true) AS definition
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname IN (
            'organizations_pkey', 'vehicles_pkey', 'vehicles_organization_id_fk',
            'vehicles_weekly_price_cents_non_negative_check', 'vehicles_year_reasonable_check'
          )`;
      const expectedConstraints = new Map([
        ["organizations_pkey", { type: "p", deleteAction: " ", pattern: /^PRIMARY KEY \(id\)$/ }],
        ["vehicles_pkey", { type: "p", deleteAction: " ", pattern: /^PRIMARY KEY \(id\)$/ }],
        ["vehicles_organization_id_fk", { type: "f", deleteAction: "r", pattern: /^FOREIGN KEY \(organization_id\) REFERENCES organizations\(id\) ON DELETE RESTRICT$/ }],
        ["vehicles_weekly_price_cents_non_negative_check", { type: "c", deleteAction: " ", pattern: /weekly_price_cents >= 0/ }],
        ["vehicles_year_reasonable_check", { type: "c", deleteAction: " ", pattern: /year >= 1900 AND year <= 2200/ }],
      ]);
      if (constraints.length !== expectedConstraints.size || constraints.some((constraint) => {
        const expected = expectedConstraints.get(constraint.conname);
        return !expected || constraint.contype !== expected.type
          || constraint.confdeltype !== expected.deleteAction
          || !expected.pattern.test(constraint.definition);
      })) refuse("CONSTRAINT_STRUCTURE");

      const [slugIndex] = await transaction`SELECT indexdef
        FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'organizations'
          AND indexname = 'organizations_slug_unique_idx'`;
      if (!slugIndex?.indexdef.includes("UNIQUE INDEX") || !/\(slug\)$/.test(slugIndex.indexdef)) {
        refuse("SLUG_UNIQUENESS");
      }
      const statusLabels = await transaction`SELECT enumlabel
        FROM pg_enum WHERE enumtypid = 'public.vehicle_status'::regtype ORDER BY enumsortorder`;
      if (!recordsEqual(statusLabels, [
        { enumlabel: "available" }, { enumlabel: "reserved" }, { enumlabel: "rented" },
        { enumlabel: "maintenance" }, { enumlabel: "inactive" },
      ])) refuse("VEHICLE_STATUS_ENUM");
    },
    async readFixtureState() {
      const organization = authorizedLeadFlowFixture.organization;
      const vehicle = authorizedLeadFlowFixture.vehicle;
      const organizations = await transaction`SELECT id::text, name, slug FROM public.organizations
        WHERE id = ${organization.id} OR slug = ${organization.slug}`;
      const vehicles = await transaction`SELECT id::text, organization_id::text AS "organizationId",
          brand, model, version, year, color, weekly_price_cents AS "weeklyPriceCents",
          status::text, is_demo AS "isDemo"
        FROM public.vehicles WHERE id = ${vehicle.id}`;
      return { organizations, vehicles };
    },
    async insertFixture(fixture) {
      const organization = fixture.organization;
      const vehicle = fixture.vehicle;
      await transaction`INSERT INTO public.organizations (id, name, slug)
        VALUES (${organization.id}, ${organization.name}, ${organization.slug})`;
      await transaction`INSERT INTO public.vehicles (
          id, organization_id, brand, model, version, year, color,
          weekly_price_cents, status, is_demo
        ) VALUES (
          ${vehicle.id}, ${vehicle.organizationId}, ${vehicle.brand}, ${vehicle.model}, ${vehicle.version},
          ${vehicle.year}, ${vehicle.color}, ${vehicle.weeklyPriceCents}, ${vehicle.status}, ${vehicle.isDemo}
        )`;
    },
  };
}

function safeFailure(error) {
  if (error instanceof LeadFlowFixtureError) return error.code;
  const code = typeof error === "object" && error !== null && typeof error.code === "string"
    && /^[A-Z0-9_]{2,20}$/.test(error.code) ? error.code : "REMOTE_FAILURE";
  return code;
}

if (process.argv.length !== 3) {
  console.error("Provisionamento recusado (CA_PATH_REQUIRED). Nenhum segredo foi exibido.");
  process.exit(1);
}

let sql;
try {
  const ca = validateCertificate(await readFile(process.argv[2], { encoding: "utf8", flag: constants.O_RDONLY | constants.O_NOFOLLOW }));
  const environment = parseEnv(await readFile(migrationEnvironmentFile, "utf8"));
  const adminUrl = validateAdministrativeEnvironment(environment);
  const expectedMigrations = await localMigrationHistory();

  sql = postgres({
    host: adminUrl.hostname,
    port: 5432,
    database: "postgres",
    username: decodeURIComponent(adminUrl.username),
    password: decodeURIComponent(adminUrl.password),
    max: 1,
    connect_timeout: 8,
    prepare: false,
    ssl: { ca, rejectUnauthorized: true, servername: adminUrl.hostname },
    connection: {
      application_name: "locacao_lead_flow_fixture",
      statement_timeout: 15_000,
      lock_timeout: 5_000,
    },
  });

  const result = await sql.begin(async (transaction) => provisionLeadFlowFixture(
    createAdapter(transaction, expectedMigrations),
  ));
  console.log(JSON.stringify({
    status: result.status,
    projectMatchesAuthorization: true,
    databaseMatchesAuthorization: true,
    migrationsValidated: expectedMigrations.length,
    structureValidated: true,
    transactionCommitted: true,
    organizationId: authorizedLeadFlowFixture.organization.id,
    vehicleId: authorizedLeadFlowFixture.vehicle.id,
  }));
} catch (error) {
  console.error(`Provisionamento recusado (${safeFailure(error)}). Nenhum segredo foi exibido.`);
  process.exitCode = 1;
} finally {
  if (sql) await sql.end({ timeout: 2 }).catch(() => undefined);
}
