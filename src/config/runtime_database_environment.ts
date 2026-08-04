import "server-only";

import { Buffer } from "node:buffer";
import { z } from "zod";

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const MAX_CA_BASE64_LENGTH = 32_768;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const requiredValue = z.string({ error: "variável obrigatória" }).trim().min(1, "valor vazio");

export type LocalRuntimeDatabaseEnvironment = {
  provider: "local";
  databaseUrl: string;
};

export type SupabaseRuntimeDatabaseEnvironment = {
  provider: "supabase";
  projectRef: string;
  databaseUrl: string;
  sslCa: string;
};

export type RuntimeDatabaseEnvironment = LocalRuntimeDatabaseEnvironment | SupabaseRuntimeDatabaseEnvironment;

export class RuntimeDatabaseEnvironmentError extends Error {
  readonly code = "INVALID_RUNTIME_DATABASE_ENVIRONMENT";

  constructor(reason: string) {
    super(`Configuração de runtime PostgreSQL recusada: ${reason}.`);
    this.name = "RuntimeDatabaseEnvironmentError";
  }
}

function fail(reason: string): never {
  throw new RuntimeDatabaseEnvironmentError(reason);
}

function parsePostgresqlUrl(value: string, field: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") fail(`${field} deve usar PostgreSQL`);
    return url;
  } catch (error) {
    if (error instanceof RuntimeDatabaseEnvironmentError) throw error;
    return fail(`${field} inválida`);
  }
}

function decodeCertificate(value: string): string {
  if (!value || value.length > MAX_CA_BASE64_LENGTH || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return fail("SUPABASE_RUNTIME_SSL_CA_BASE64 inválida");
  }

  const decoded = Buffer.from(value, "base64").toString("utf8").trim();
  const normalizedInput = value.replace(/=+$/, "");
  const normalizedRoundTrip = Buffer.from(decoded, "utf8").toString("base64").replace(/=+$/, "");
  if (normalizedInput !== normalizedRoundTrip) fail("SUPABASE_RUNTIME_SSL_CA_BASE64 inválida");

  const beginCount = decoded.match(/-----BEGIN CERTIFICATE-----/g)?.length ?? 0;
  const endCount = decoded.match(/-----END CERTIFICATE-----/g)?.length ?? 0;
  const pemPattern = /^-----BEGIN CERTIFICATE-----\r?\n(?:[A-Za-z0-9+/]{16,64}\r?\n)+-----END CERTIFICATE-----$/;
  if (beginCount !== 1 || endCount !== 1 || !pemPattern.test(decoded)) {
    fail("SUPABASE_RUNTIME_SSL_CA_BASE64 deve conter um único certificado PEM");
  }
  return `${decoded}\n`;
}

export function parseRuntimeDatabaseEnvironment(
  environment: Record<string, string | undefined>,
): RuntimeDatabaseEnvironment {
  const provider = environment.DATABASE_RUNTIME_PROVIDER?.trim()
    || (environment.NODE_ENV === "production" ? fail("DATABASE_RUNTIME_PROVIDER obrigatória em produção") : "local");

  if (provider !== "local" && provider !== "supabase") fail("DATABASE_RUNTIME_PROVIDER inválida");

  if (provider === "local") {
    const result = requiredValue.safeParse(environment.DATABASE_URL);
    if (!result.success) fail("DATABASE_URL inválida");
    const url = parsePostgresqlUrl(result.data, "DATABASE_URL");
    return { provider: "local", databaseUrl: url.href };
  }

  const requiredFields = [
    "SUPABASE_RUNTIME_PROJECT_REF",
    "SUPABASE_RUNTIME_DATABASE_URL",
    "SUPABASE_RUNTIME_SSL_CA_BASE64",
    "SUPABASE_RUNTIME_CONFIRMATION",
  ] as const;
  const missing = requiredFields.filter((field) => !environment[field]?.trim());
  if (missing.length) fail(`variáveis inválidas: ${missing.join(", ")}`);

  const projectRef = environment.SUPABASE_RUNTIME_PROJECT_REF!.trim();
  if (!PROJECT_REF_PATTERN.test(projectRef)) fail("SUPABASE_RUNTIME_PROJECT_REF inválida");
  const runtimeUrl = parsePostgresqlUrl(environment.SUPABASE_RUNTIME_DATABASE_URL!, "SUPABASE_RUNTIME_DATABASE_URL");

  if (LOCAL_HOSTS.has(runtimeUrl.hostname)) fail("conexões locais não são aceitas no provider Supabase");
  if (runtimeUrl.hostname === `db.${projectRef}.supabase.co`) fail("conexão direta não é aceita no runtime");
  if (!runtimeUrl.hostname.endsWith(".pooler.supabase.com")) fail("o runtime deve usar o Transaction pooler");
  if (!runtimeUrl.hostname.includes("sa-east-1") || runtimeUrl.hostname.includes("ca-central-1")) fail("a região do runtime deve ser sa-east-1");
  if (runtimeUrl.port === "5432") fail("o Session pooler não é aceito no runtime serverless");
  if (runtimeUrl.port !== "6543") fail("o Transaction pooler deve usar a porta 6543");
  if (decodeURIComponent(runtimeUrl.pathname) !== "/postgres") fail("o banco de runtime deve ser postgres");

  const username = decodeURIComponent(runtimeUrl.username);
  if (username === `postgres.${projectRef}` || username.startsWith("postgres.")) fail("a credencial administrativa não é aceita no runtime");
  if (username !== `lead_intake_runtime.${projectRef}`) fail("o usuário de runtime não corresponde à role e ao project ref");
  if (!runtimeUrl.password) fail("a senha de runtime é obrigatória");
  if (runtimeUrl.searchParams.get("sslmode") !== "verify-full") fail("o runtime Supabase exige sslmode verify-full");
  if (environment.SUPABASE_RUNTIME_CONFIRMATION !== `locacao_carros:${projectRef}:lead_intake_runtime`) {
    fail("a confirmação de runtime está ausente ou divergente");
  }

  return {
    provider: "supabase",
    projectRef,
    databaseUrl: runtimeUrl.href,
    sslCa: decodeCertificate(environment.SUPABASE_RUNTIME_SSL_CA_BASE64!),
  };
}
