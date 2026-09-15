import { createHash, X509Certificate } from "node:crypto";
import { constants } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import postgres from "postgres";
import { leadRetentionConfirmation, LeadRetentionError, runLeadRetention } from "./lead_retention.mjs";
import { createPostgresLeadRetentionAdapter } from "./lead_retention_postgres.mjs";

const expectedProjectRef = "avglmahriseqpoysdmom";
const expectedRegion = "sa-east-1";
const environmentFile = ".env.supabase.local";

function refuse(code) { throw new LeadRetentionError(code); }

function argumentsFrom(commandLine) {
  const [caPath, ...options] = commandLine;
  const organizationOption = options.find((value) => value.startsWith("--organization-id="));
  const confirmationOption = options.find((value) => value.startsWith("--confirm="));
  const preview = options.includes("--preview");
  const execute = options.includes("--execute");
  if (!caPath || preview === execute || !organizationOption
    || options.some((value) => !value.startsWith("--organization-id=") && !value.startsWith("--confirm=") && !["--preview", "--execute"].includes(value))) {
    refuse("INVALID_ARGUMENTS");
  }
  return {
    caPath,
    organizationId: organizationOption.slice("--organization-id=".length),
    execute,
    confirmation: confirmationOption?.slice("--confirm=".length),
  };
}

async function privateEnvironment() {
  const metadata = await lstat(environmentFile);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) refuse("INSECURE_ENVIRONMENT_FILE");
  return parseEnv(await readFile(environmentFile, { encoding: "utf8", flag: constants.O_RDONLY | constants.O_NOFOLLOW }));
}

function certificate(contents) {
  const ca = contents.trim();
  const certificates = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!certificates || certificates.length !== 1 || certificates[0] !== ca) refuse("INVALID_CA");
  try { new X509Certificate(ca); } catch { refuse("INVALID_CA"); }
  return `${ca}\n`;
}

function administrativeUrl(environment) {
  if (environment.SUPABASE_PROJECT_REF !== expectedProjectRef
    || environment.SUPABASE_REMOTE_MIGRATION_CONFIRMATION !== `locacao_carros:${expectedProjectRef}`) refuse("PROJECT_CONFIGURATION");
  let url;
  try { url = new URL(environment.SUPABASE_MIGRATION_DATABASE_URL); } catch { refuse("ADMINISTRATIVE_URL"); }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)
    || decodeURIComponent(url.username) !== `postgres.${expectedProjectRef}`
    || url.port !== "5432"
    || decodeURIComponent(url.pathname) !== "/postgres"
    || url.searchParams.get("sslmode") !== "require"
    || !new RegExp(`^aws-[0-9]+-${expectedRegion}\\.pooler\\.supabase\\.com$`).test(url.hostname)) refuse("ADMINISTRATIVE_ENDPOINT");
  return url;
}

async function expectedMigrationHistory() {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  if (!Array.isArray(journal.entries) || journal.entries.length !== 5 || journal.entries[4]?.tag !== "0004_useful_human_torch") {
    refuse("LOCAL_MIGRATION_HISTORY");
  }
  return Promise.all(journal.entries.map(async (entry, index) => {
    if (entry.idx !== index || !Number.isSafeInteger(entry.when)) refuse("LOCAL_MIGRATION_HISTORY");
    const contents = await readFile(`drizzle/${entry.tag}.sql`);
    return { hash: createHash("sha256").update(contents).digest("hex"), createdAt: String(entry.when) };
  }));
}

function safeCode(error) {
  if (error instanceof LeadRetentionError) return error.code;
  return typeof error === "object" && error !== null && typeof error.code === "string" && /^[A-Z0-9_]{2,20}$/.test(error.code)
    ? error.code : "RETENTION_FAILURE";
}

let sql;
try {
  const options = argumentsFrom(process.argv.slice(2));
  const ca = certificate(await readFile(options.caPath, { encoding: "utf8", flag: constants.O_RDONLY | constants.O_NOFOLLOW }));
  const url = administrativeUrl(await privateEnvironment());
  const expectedMigrations = await expectedMigrationHistory();
  sql = postgres({
    host: url.hostname,
    port: 5432,
    database: "postgres",
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    max: 1,
    prepare: false,
    ssl: { ca, rejectUnauthorized: true, servername: url.hostname },
    connection: { application_name: "locacao_lead_retention", statement_timeout: 15_000, lock_timeout: 5_000 },
  });
  const validations = {
    async validateTarget() {
      const [identity] = await sql`SELECT current_user, current_database()`;
      if (identity.current_user !== "postgres" || identity.current_database !== "postgres") refuse("TARGET_IDENTITY");
    },
    async validateMigrations() {
      const remote = await sql`SELECT hash, created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
      if (remote.length !== expectedMigrations.length || remote.some((item, index) => (
        item.hash !== expectedMigrations[index].hash || item.created_at !== expectedMigrations[index].createdAt
      ))) refuse("MIGRATION_STATE");
    },
    async validateStructure() {
      const columns = await sql`SELECT table_name, column_name, data_type, udt_name, is_nullable
        FROM information_schema.columns WHERE table_schema = 'public' AND (
          (table_name = 'rental_leads' AND column_name IN ('id', 'organization_id', 'status', 'created_at'))
          OR (table_name = 'lead_status_history' AND column_name = 'rental_lead_id')
        )`;
      const expectedColumns = new Set([
        "rental_leads:id:uuid:uuid:NO",
        "rental_leads:organization_id:uuid:uuid:NO",
        "rental_leads:status:USER-DEFINED:lead_status:NO",
        "rental_leads:created_at:timestamp with time zone:timestamptz:NO",
        "lead_status_history:rental_lead_id:uuid:uuid:NO",
      ]);
      const [converted] = await sql`SELECT EXISTS (
        SELECT 1 FROM pg_enum WHERE enumtypid = 'public.lead_status'::regtype AND enumlabel = 'converted'
      ) AS exists`;
      const [foreignKey] = await sql`SELECT confdeltype FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'lead_status_history_rental_lead_id_fk' AND contype = 'f'`;
      const [rls] = await sql`SELECT relrowsecurity FROM pg_class
        WHERE oid = 'public.rental_leads'::regclass`;
      const [privileges] = await sql`SELECT
        has_table_privilege('lead_intake_runtime', 'public.rental_leads', 'SELECT') AS can_select,
        has_table_privilege('lead_intake_runtime', 'public.rental_leads', 'DELETE') AS can_delete`;
      const actualColumns = new Set(columns.map((column) => (
        `${column.table_name}:${column.column_name}:${column.data_type}:${column.udt_name}:${column.is_nullable}`
      )));
      if (actualColumns.size !== expectedColumns.size || [...expectedColumns].some((column) => !actualColumns.has(column))
        || !converted.exists || foreignKey?.confdeltype !== "r" || !rls?.relrowsecurity
        || privileges.can_select || privileges.can_delete) refuse("RETENTION_STRUCTURE");
    },
  };
  const result = await runLeadRetention(createPostgresLeadRetentionAdapter(sql, validations), options);
  console.log(JSON.stringify({ ...result, targetValidated: true, migrationsValidated: expectedMigrations.length, structureValidated: true }));
} catch (error) {
  console.error(`Retenção recusada (${safeCode(error)}). Nenhum dado pessoal ou segredo foi exibido.`);
  process.exitCode = 1;
} finally {
  if (sql) await sql.end({ timeout: 2 }).catch(() => undefined);
}

export { leadRetentionConfirmation };
