import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";

const migration = readFileSync("drizzle/0008_vehicle_operational_status.sql", "utf8")
  .replaceAll("--> statement-breakpoint", "");
const priorMigrations = Array.from({ length: 8 }, (_, index) => {
  const prefix = index.toString().padStart(4, "0");
  const entry = index === 0 ? "0000_heavy_valkyrie"
    : index === 1 ? "0001_supabase_rls_hardening"
      : index === 2 ? "0002_clean_hawkeye"
        : index === 3 ? "0003_runtime_lead_intake_access"
          : index === 4 ? "0004_useful_human_torch"
            : index === 5 ? "0005_central_interessados"
              : index === 6 ? "0006_restrict_rls_auto_enable_execute"
                : "0007_reservations_availability";
  if (!entry.startsWith(prefix)) throw new Error("Histórico de migration inesperado");
  return readFileSync(`drizzle/${entry}.sql`, "utf8").replaceAll("--> statement-breakpoint", "");
});

describe("migration 0008: expansão do estado operacional", () => {
  let admin: ReturnType<typeof postgres>;
  let isolated: ReturnType<typeof postgres>;
  let databaseName: string;

  beforeAll(async () => {
    const { testDatabaseUrl } = parseTestDatabaseEnvironment(process.env);
    const adminUrl = new URL(testDatabaseUrl);
    adminUrl.pathname = "/postgres";
    databaseName = `operational_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}_test`;
    admin = postgres(adminUrl.toString(), { max: 1 });
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`).simple();
    const isolatedUrl = new URL(testDatabaseUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    isolated = postgres(isolatedUrl.toString(), { max: 1 });
    for (const sql of priorMigrations) await isolated.unsafe(sql).simple();
    await isolated`insert into organizations (id, name, slug)
      values ('10000000-0000-4000-8000-000000000099', 'Locadora migration', 'locadora_migration')`;
  }, 30000);

  afterAll(async () => {
    if (isolated) await isolated.end();
    if (admin && databaseName) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`).simple();
      await admin.end();
    }
  });

  it.each(["reserved", "rented", "maintenance"])("recusa o estado legado ambíguo %s sem expansão parcial", async (legacyStatus) => {
    await isolated`insert into vehicles (organization_id, brand, model, year, color, weekly_price_cents, status)
      values ('10000000-0000-4000-8000-000000000099', 'Marca', 'Ambíguo', 2024, 'Prata', 70000, ${legacyStatus})`;
    await isolated.unsafe("BEGIN").simple();
    await expect(isolated.unsafe(migration).simple()).rejects.toMatchObject({
      code: "23514",
      message: expect.stringContaining("vehicle_operational_status_backfill_unsupported_legacy_status"),
    });
    await isolated.unsafe("ROLLBACK").simple();
    expect(await isolated`select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vehicles' and column_name = 'operational_status'`).toHaveLength(0);
    await isolated`delete from vehicles`;
  });

  it("converte somente available e inactive e torna a coluna obrigatória", async () => {
    await isolated`insert into vehicles (id, organization_id, brand, model, year, color, weekly_price_cents, status) values
      ('20000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000099', 'Marca', 'Ativo', 2024, 'Prata', 70000, 'available'),
      ('20000000-0000-4000-8000-000000000092', '10000000-0000-4000-8000-000000000099', 'Marca', 'Inativo', 2024, 'Prata', 70000, 'inactive')`;
    await isolated.unsafe("BEGIN").simple();
    await isolated.unsafe(migration).simple();
    await isolated.unsafe("COMMIT").simple();
    expect(await isolated`select status, operational_status from vehicles order by id`).toEqual([
      { status: "available", operational_status: "active" },
      { status: "inactive", operational_status: "inactive" },
    ]);
    const [column] = await isolated`select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'vehicles' and column_name = 'operational_status'`;
    expect(column).toEqual({ is_nullable: "NO" });
  });
});
