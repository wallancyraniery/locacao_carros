import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import postgres from "postgres";
import { expect, it, vi } from "vitest";
import {
  expectedRuntimeColumnPrivileges,
  hasExactRuntimeMemberships,
  runtimeDiagnosticErrorCode,
  safeRuntimeDiagnosticError,
  type RuntimeMembership,
} from "@/config/supabase_runtime_diagnostic";

vi.mock("server-only", () => ({}));

const runtimeEnvironmentFile = ".env.supabase.runtime.local";

it("valida a conexão exclusiva do runtime Supabase sem escrever dados", async () => {
  let sql: ReturnType<typeof postgres> | undefined;
  let connectionClosed = true;
  const diagnostic = {
    scope: "runtime_access_read_only",
    runtimeCredentialOnly: false,
    transactionPooler6543: false,
    tlsIdentityVerified: false,
    currentUserMatches: false,
    administrativePrivilegesAbsent: false,
    ownershipAbsent: false,
    exactMembership: false,
    grantsMatch: false,
    policiesMatch: false,
    vehicleQueryAllowed: false,
    availableVehicleObserved: false,
    rentalLeadsReadDenied: false,
    connectionClosed: true,
    failureStage: null as string | null,
    failureCode: null as string | null,
  };
  let stage = "runtime_environment";

  try {
    const variables = parseEnv(readFileSync(runtimeEnvironmentFile, "utf8"));
    expect(variables.SUPABASE_MIGRATION_DATABASE_URL).toBeUndefined();
    expect(variables.SUPABASE_PROJECT_REF).toBeUndefined();
    const [{ parseRuntimeDatabaseEnvironment }, { createRuntimeDatabaseClientConfiguration }] = await Promise.all([
      import("@/config/runtime_database_environment"),
      import("@/modules/database/client.server"),
    ]);
    const environment = parseRuntimeDatabaseEnvironment(variables);
    expect(environment.provider).toBe("supabase");
    if (environment.provider !== "supabase") throw new Error("provider inesperado");
    expect(environment.projectRef).toBe("avglmahriseqpoysdmom");
    const configuration = createRuntimeDatabaseClientConfiguration(environment, () => 0);
    const runtimeUrl = new URL(configuration.url);
    diagnostic.runtimeCredentialOnly = decodeURIComponent(runtimeUrl.username) === "lead_intake_runtime.avglmahriseqpoysdmom";
    diagnostic.transactionPooler6543 = runtimeUrl.port === "6543";
    expect(configuration.options.ssl).toMatchObject({ rejectUnauthorized: true, servername: runtimeUrl.hostname });

    stage = "client_creation";
    sql = postgres(configuration.url, {
      ...configuration.options,
      connection: {
        application_name: "locacao_runtime_readonly_diagnostic",
        default_transaction_read_only: true,
        statement_timeout: 15_000,
        lock_timeout: 5_000,
      },
    });
    connectionClosed = false;

    stage = "identity_query";
    await sql.unsafe("BEGIN READ ONLY");
    const [identity] = await sql`SELECT
      current_user = 'lead_intake_runtime' AS user_ok,
      current_database() = 'postgres' AS database_ok,
      current_setting('transaction_read_only') = 'on' AS read_only`;
    diagnostic.tlsIdentityVerified = true;
    diagnostic.currentUserMatches = identity.user_ok === true;
    expect(identity).toEqual({ user_ok: true, database_ok: true, read_only: true });

    stage = "role_audit";
    const [role] = await sql`SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
      rolinherit, rolreplication, rolbypassrls
      FROM pg_roles WHERE rolname = current_user`;
    expect(role).toEqual({
      rolcanlogin: true,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolinherit: false,
      rolreplication: false,
      rolbypassrls: false,
    });
    diagnostic.administrativePrivilegesAbsent = true;

    const ownership = await sql`SELECT 1 FROM pg_shdepend
      WHERE refclassid = 'pg_authid'::regclass
        AND refobjid = current_user::regrole
        AND deptype = 'o'`;
    expect(ownership).toHaveLength(0);
    diagnostic.ownershipAbsent = true;

    const memberships = await sql<RuntimeMembership[]>`SELECT
      granted.rolname AS "grantedRole", member.rolname AS member, grantor.rolname AS grantor,
      membership.admin_option AS "adminOption", membership.inherit_option AS "inheritOption",
      membership.set_option AS "setOption"
      FROM pg_auth_members membership
      JOIN pg_roles granted ON granted.oid = membership.roleid
      JOIN pg_roles member ON member.oid = membership.member
      JOIN pg_roles grantor ON grantor.oid = membership.grantor
      WHERE granted.rolname = 'lead_intake_runtime' OR member.rolname = 'lead_intake_runtime'`;
    expect(hasExactRuntimeMemberships([...memberships])).toBe(true);
    diagnostic.exactMembership = true;

    stage = "grant_audit";
    const tablePrivileges = await sql`SELECT table_name, privilege,
      has_table_privilege(current_user, format('public.%I', table_name), privilege) AS allowed
      FROM (VALUES ('organizations'), ('vehicles'), ('rental_leads'), ('lead_status_history')) tables(table_name)
      CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
        ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) privileges(privilege)`;
    expect(tablePrivileges.every(({ allowed }) => allowed === false)).toBe(true);

    const [schemaPrivileges] = await sql`SELECT
      has_schema_privilege(current_user, 'public', 'USAGE') AS usage,
      has_schema_privilege(current_user, 'public', 'CREATE') AS create`;
    expect(schemaPrivileges).toEqual({ usage: true, create: false });

    const columnPrivileges = await sql`SELECT class.relname, attribute.attname, privilege,
      has_column_privilege(current_user, class.oid, attribute.attnum, privilege) AS allowed,
      has_column_privilege(current_user, class.oid, attribute.attnum,
        privilege || ' WITH GRANT OPTION') AS grantable
      FROM pg_attribute attribute
      JOIN pg_class class ON class.oid = attribute.attrelid
      JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
      CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) privileges(privilege)
      WHERE namespace.nspname = 'public'
        AND class.relname IN ('organizations', 'vehicles', 'rental_leads', 'lead_status_history')
        AND attribute.attnum > 0 AND NOT attribute.attisdropped`;
    expect(columnPrivileges.every(({ relname, attname, privilege, allowed, grantable }) =>
      allowed === expectedRuntimeColumnPrivileges.has(`${relname}:${attname}:${privilege}`)
        && grantable === false)).toBe(true);
    diagnostic.grantsMatch = true;

    stage = "policy_audit";
    const policies = await sql`SELECT tablename, policyname, permissive, cmd, roles
      FROM pg_policies
      WHERE schemaname = 'public' AND roles && ARRAY['lead_intake_runtime', 'public']::name[]
      ORDER BY tablename, policyname`;
    expect(policies).toEqual([
      { tablename: "organizations", policyname: "lead_intake_runtime_enable_demo_organization_select", permissive: "PERMISSIVE", cmd: "SELECT", roles: ["lead_intake_runtime"] },
      { tablename: "organizations", policyname: "lead_intake_runtime_guard_demo_organization_select", permissive: "RESTRICTIVE", cmd: "SELECT", roles: ["lead_intake_runtime"] },
      { tablename: "rental_leads", policyname: "lead_intake_runtime_enable_new_demo_lead_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["lead_intake_runtime"] },
      { tablename: "rental_leads", policyname: "lead_intake_runtime_guard_new_demo_lead_insert", permissive: "RESTRICTIVE", cmd: "INSERT", roles: ["lead_intake_runtime"] },
      { tablename: "vehicles", policyname: "lead_intake_runtime_enable_available_demo_vehicle_select", permissive: "PERMISSIVE", cmd: "SELECT", roles: ["lead_intake_runtime"] },
      { tablename: "vehicles", policyname: "lead_intake_runtime_guard_available_demo_vehicle_select", permissive: "RESTRICTIVE", cmd: "SELECT", roles: ["lead_intake_runtime"] },
    ]);
    diagnostic.policiesMatch = true;

    stage = "vehicle_query";
    const vehicles = await sql`SELECT id, organization_id, status, is_demo
      FROM public.vehicles LIMIT 1`;
    diagnostic.vehicleQueryAllowed = true;
    diagnostic.availableVehicleObserved = vehicles.length === 1;
    await sql.unsafe("COMMIT");

    stage = "rental_leads_denial";
    try {
      await sql`SELECT id FROM public.rental_leads LIMIT 0`;
      expect.fail("a leitura de rental_leads deveria ser recusada");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      expect(code).toBe("42501");
      diagnostic.rentalLeadsReadDenied = true;
    }
    stage = "complete";
  } catch (error) {
    diagnostic.failureStage = stage;
    diagnostic.failureCode = runtimeDiagnosticErrorCode(error) ?? null;
    if (error instanceof Error && error.name === "AssertionError") throw error;
    throw safeRuntimeDiagnosticError(error);
  } finally {
    if (sql) {
      try {
        await sql.end({ timeout: 2 });
        connectionClosed = true;
      } catch {
        connectionClosed = false;
      }
    }
    diagnostic.connectionClosed = connectionClosed;
    process.stdout.write(`${JSON.stringify(diagnostic)}\n`);
    expect(connectionClosed).toBe(true);
  }
});
