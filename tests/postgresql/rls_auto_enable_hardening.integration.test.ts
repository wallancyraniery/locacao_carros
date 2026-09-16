import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";

const helperIdentity = "public.rls_auto_enable()";
const migration = readFileSync(
  "drizzle/0006_restrict_rls_auto_enable_execute.sql",
  "utf8",
).replaceAll("--> statement-breakpoint", "");

describe("hardening do helper de auto-RLS", () => {
  let sql: ReturnType<typeof postgres>;
  let createdHelper = false;
  let createdTrigger = false;

  beforeAll(async () => {
    const { testDatabaseUrl } = parseTestDatabaseEnvironment(process.env);
    sql = postgres(testDatabaseUrl, { max: 1 });
  });

  afterAll(async () => {
    if (!sql) return;
    if (createdTrigger) await sql`DROP EVENT TRIGGER IF EXISTS ensure_rls`;
    if (createdHelper) await sql`DROP FUNCTION IF EXISTS public.rls_auto_enable()`;
    await sql.end();
  });

  it("permanece aplicável quando o helper não existe", async () => {
    const [helper] = await sql`SELECT to_regprocedure(${helperIdentity}) AS identity`;
    if (helper.identity === null) await expect(sql.unsafe(migration).simple()).resolves.toBeDefined();
  });

  it("revoga EXECUTE público sem remover helper ou event trigger", async () => {
    const [existingHelper] = await sql`SELECT to_regprocedure(${helperIdentity}) AS identity`;
    if (existingHelper.identity === null) {
      await sql.unsafe(`
        CREATE FUNCTION public.rls_auto_enable()
        RETURNS event_trigger
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS 'BEGIN NULL; END'
      `);
      createdHelper = true;
    }

    const [existingTrigger] = await sql`
      SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls'
    `;
    if (!existingTrigger) {
      await sql.unsafe(`
        CREATE EVENT TRIGGER ensure_rls
        ON ddl_command_end
        WHEN TAG IN ('CREATE TABLE')
        EXECUTE FUNCTION public.rls_auto_enable()
      `);
      createdTrigger = true;
    }

    const [before] = await sql`
      SELECT procedure.oid, procedure.prosecdef, trigger.evtfoid, trigger.evtenabled
      FROM pg_proc AS procedure
      JOIN pg_event_trigger AS trigger ON trigger.evtfoid = procedure.oid
      WHERE procedure.oid = to_regprocedure(${helperIdentity})
        AND trigger.evtname = 'ensure_rls'
    `;
    expect(before).toMatchObject({ prosecdef: true, evtenabled: "O" });

    if (createdHelper) {
      await sql`GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO PUBLIC, anon, authenticated`;
    }
    await sql.unsafe(migration).simple();

    const [privileges] = await sql`
      SELECT
        EXISTS (
          SELECT 1
          FROM pg_proc AS procedure
          CROSS JOIN LATERAL aclexplode(
            COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
          ) AS privilege
          WHERE procedure.oid = to_regprocedure(${helperIdentity})
            AND privilege.grantee = 0
            AND privilege.privilege_type = 'EXECUTE'
        ) AS public_execute,
        has_function_privilege('anon', ${helperIdentity}, 'EXECUTE') AS anon_execute,
        has_function_privilege('authenticated', ${helperIdentity}, 'EXECUTE') AS authenticated_execute
    `;
    expect(privileges).toEqual({
      public_execute: false,
      anon_execute: false,
      authenticated_execute: false,
    });

    const [after] = await sql`
      SELECT procedure.oid, procedure.prosecdef, trigger.evtfoid, trigger.evtenabled
      FROM pg_proc AS procedure
      JOIN pg_event_trigger AS trigger ON trigger.evtfoid = procedure.oid
      WHERE procedure.oid = to_regprocedure(${helperIdentity})
        AND trigger.evtname = 'ensure_rls'
    `;
    expect(after).toEqual(before);
  });
});
