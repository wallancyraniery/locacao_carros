import { Buffer } from "node:buffer";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getProductionEnvironment = vi.hoisted(() => vi.fn());
vi.mock("@/config/production_environment.server", () => ({ getProductionEnvironment }));

const projectRef = "abcdefghijklmnopqrst";
const pem = ["-----BEGIN CERTIFICATE-----", "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo1MjM0NTY3ODkwQUJDREVGR0hJSktM", "MA==", "-----END CERTIFICATE-----"].join("\n");
const runtime = {
  DATABASE_RUNTIME_PROVIDER: "supabase",
  SUPABASE_RUNTIME_PROJECT_REF: projectRef,
  SUPABASE_RUNTIME_DATABASE_URL: `postgresql://lead_intake_runtime.${projectRef}:runtime_password_test@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=verify-full`,
  SUPABASE_RUNTIME_SSL_CA_BASE64: Buffer.from(pem).toString("base64"),
  SUPABASE_RUNTIME_CONFIRMATION: `locacao_carros:${projectRef}:lead_intake_runtime`,
};
async function load() { return import("@/config/runtime_database_environment.server"); }
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });

it("Preview usa somente o contrato estrito de runtime e não exige Turnstile ou privacidade", async () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL_ENV", "preview");
  for (const [key, value] of Object.entries(runtime)) vi.stubEnv(key, value);
  const { getRuntimeDatabaseEnvironment } = await load();
  expect(getRuntimeDatabaseEnvironment()).toMatchObject({ provider: "supabase", projectRef });
  expect(getProductionEnvironment).not.toHaveBeenCalled();
});

it("Preview falha fechado quando o runtime é inválido ou contém DATABASE_URL administrativo", async () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL_ENV", "preview");
  for (const [key, value] of Object.entries(runtime)) vi.stubEnv(key, value);
  vi.stubEnv("SUPABASE_RUNTIME_DATABASE_URL", runtime.SUPABASE_RUNTIME_DATABASE_URL.replace(":6543/", ":5432/"));
  let runtimeModule = await load(); expect(() => runtimeModule.getRuntimeDatabaseEnvironment()).toThrow();
  vi.resetModules(); vi.stubEnv("SUPABASE_RUNTIME_DATABASE_URL", runtime.SUPABASE_RUNTIME_DATABASE_URL); vi.stubEnv("DATABASE_URL", "postgresql://postgres:admin@localhost:5432/postgres");
  runtimeModule = await load(); expect(() => runtimeModule.getRuntimeDatabaseEnvironment()).toThrow();
});

it("Production continua delegando ao contrato completo e local preserva o contrato local", async () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL_ENV", "production");
  const expected = { provider: "supabase" as const, projectRef, databaseUrl: runtime.SUPABASE_RUNTIME_DATABASE_URL, sslCa: pem };
  getProductionEnvironment.mockReturnValue({ runtimeDatabase: expected });
  let runtimeModule = await load(); expect(runtimeModule.getRuntimeDatabaseEnvironment()).toBe(expected); expect(getProductionEnvironment).toHaveBeenCalledOnce();
  vi.resetModules(); vi.clearAllMocks(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("VERCEL_ENV", ""); vi.stubEnv("DATABASE_RUNTIME_PROVIDER", "local"); vi.stubEnv("DATABASE_URL", "postgresql://postgres:local@127.0.0.1:5432/locacao_carros");
  runtimeModule = await load(); expect(runtimeModule.getRuntimeDatabaseEnvironment()).toMatchObject({ provider: "local" }); expect(getProductionEnvironment).not.toHaveBeenCalled();
});
