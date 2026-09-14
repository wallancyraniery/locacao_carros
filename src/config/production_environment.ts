import {
  parseRuntimeDatabaseEnvironment,
  type SupabaseRuntimeDatabaseEnvironment,
} from "./runtime_database_environment";
import {
  parseTurnstileEnvironment,
  type TurnstileEnvironment,
} from "./turnstile_environment";

const forbiddenDatabaseCredentialFields = [
  "DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "TEST_DATABASE_URL",
  "POSTGRES_PASSWORD",
  "SUPABASE_MIGRATION_DATABASE_URL",
  "SUPABASE_SECRET_KEY",
] as const;

type CloudflareTurnstileEnvironment = Extract<TurnstileEnvironment, { mode: "cloudflare" }>;

export type ProductionEnvironment = {
  runtimeDatabase: SupabaseRuntimeDatabaseEnvironment;
  turnstile: CloudflareTurnstileEnvironment;
};

export class ProductionEnvironmentError extends Error {
  readonly code = "INVALID_PRODUCTION_ENVIRONMENT";

  constructor() {
    super("Configuração de produção recusada.");
    this.name = "ProductionEnvironmentError";
  }
}

function fail(): never {
  throw new ProductionEnvironmentError();
}

export function parseProductionEnvironment(
  environment: Record<string, string | undefined>,
): ProductionEnvironment {
  if (environment.NODE_ENV !== "production") fail();
  if (environment.DATABASE_RUNTIME_PROVIDER !== "supabase") fail();
  if (forbiddenDatabaseCredentialFields.some((field) => environment[field]?.trim())) fail();

  const runtimeDatabase = parseRuntimeDatabaseEnvironment(environment);
  if (runtimeDatabase.provider !== "supabase") fail();

  const turnstile = parseTurnstileEnvironment(environment);
  if (turnstile.mode !== "cloudflare") fail();

  return { runtimeDatabase, turnstile };
}
