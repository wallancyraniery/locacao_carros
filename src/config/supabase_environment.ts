import { z } from "zod";

const projectRefSchema = z.string().trim().regex(/^[a-z0-9]{20}$/, "formato inválido");
export const requiredSupabaseValueSchema = z.string({ error: "variável obrigatória" }).trim().min(1, "valor vazio");

export const supabaseProjectIdentitySchema = z.object({
  SUPABASE_PROJECT_REF: projectRefSchema,
  SUPABASE_PROJECT_URL: requiredSupabaseValueSchema,
});

const publicEnvironmentSchema = supabaseProjectIdentitySchema.extend({
  SUPABASE_PUBLISHABLE_KEY: requiredSupabaseValueSchema,
});

const migrationEnvironmentSchema = z.object({
  SUPABASE_PROJECT_REF: projectRefSchema,
  SUPABASE_MIGRATION_DATABASE_URL: requiredSupabaseValueSchema,
  SUPABASE_REMOTE_MIGRATION_CONFIRMATION: requiredSupabaseValueSchema,
});

export type SupabasePublicEnvironment = z.infer<typeof publicEnvironmentSchema>;
export type SupabaseMigrationEnvironment = z.infer<typeof migrationEnvironmentSchema>;
export type SupabaseMigrationCredentials = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: "require";
};

export class SupabaseEnvironmentError extends Error {
  readonly code = "UNSAFE_SUPABASE_ENVIRONMENT";

  constructor(reason: string) {
    super(`Configuração Supabase recusada: ${reason}.`);
    this.name = "SupabaseEnvironmentError";
  }
}

function parseSchema<T>(schema: z.ZodType<T>, environment: Record<string, string | undefined>): T {
  const result = schema.safeParse(environment);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "desconhecido")))];
    throw new SupabaseEnvironmentError(`variáveis inválidas: ${fields.join(", ")}`);
  }
  return result.data;
}

function parseUrl(value: string, field: string) {
  try {
    return new URL(value);
  } catch {
    throw new SupabaseEnvironmentError(`${field} inválida`);
  }
}

export function validateProjectIdentity(config: { SUPABASE_PROJECT_REF: string; SUPABASE_PROJECT_URL: string }): void {
  const projectUrl = parseUrl(config.SUPABASE_PROJECT_URL, "SUPABASE_PROJECT_URL");
  if (projectUrl.protocol !== "https:") throw new SupabaseEnvironmentError("a URL do projeto deve usar HTTPS");
  if (projectUrl.hostname !== `${config.SUPABASE_PROJECT_REF}.supabase.co`) {
    throw new SupabaseEnvironmentError("a URL do projeto não corresponde ao project ref");
  }
}

export function parseSupabasePublicEnvironment(environment: Record<string, string | undefined>): SupabasePublicEnvironment {
  if (typeof environment.SUPABASE_SECRET_KEY === "string") {
    throw new SupabaseEnvironmentError("SUPABASE_SECRET_KEY não é permitida no contrato público");
  }

  const config = parseSchema(publicEnvironmentSchema, environment);
  validateProjectIdentity(config);
  return config;
}

export function parseSupabaseMigrationEnvironment(environment: Record<string, string | undefined>): SupabaseMigrationEnvironment {
  const config = parseSchema(migrationEnvironmentSchema, environment);
  const migrationUrl = parseUrl(config.SUPABASE_MIGRATION_DATABASE_URL, "SUPABASE_MIGRATION_DATABASE_URL");

  if (!new Set(["postgres:", "postgresql:"]).has(migrationUrl.protocol)) throw new SupabaseEnvironmentError("a conexão de migration deve usar PostgreSQL");
  if (["localhost", "127.0.0.1", "[::1]"].includes(migrationUrl.hostname)) throw new SupabaseEnvironmentError("conexões locais não são aceitas neste fluxo");
  if (migrationUrl.hostname === `db.${config.SUPABASE_PROJECT_REF}.supabase.co`) throw new SupabaseEnvironmentError("a conexão direta não é aceita neste fluxo");
  if (!migrationUrl.hostname.endsWith(".pooler.supabase.com")) throw new SupabaseEnvironmentError("use o Session pooler do projeto");
  if (migrationUrl.port === "6543") throw new SupabaseEnvironmentError("o Transaction pooler não é aceito para migrations");
  if (migrationUrl.port !== "5432") throw new SupabaseEnvironmentError("o Session pooler deve usar a porta 5432");
  if (decodeURIComponent(migrationUrl.pathname) !== "/postgres") throw new SupabaseEnvironmentError("o banco de migrations deve ser postgres");
  if (decodeURIComponent(migrationUrl.username) !== `postgres.${config.SUPABASE_PROJECT_REF}`) throw new SupabaseEnvironmentError("o usuário não corresponde ao project ref");
  if (migrationUrl.searchParams.get("sslmode") !== "require") throw new SupabaseEnvironmentError("SSL obrigatório para migrations remotas");
  if (config.SUPABASE_REMOTE_MIGRATION_CONFIRMATION !== `locacao_carros:${config.SUPABASE_PROJECT_REF}`) {
    throw new SupabaseEnvironmentError("confirmação remota ausente ou divergente");
  }

  return config;
}

export function createSupabaseMigrationCredentials(config: SupabaseMigrationEnvironment): SupabaseMigrationCredentials {
  try {
    const migrationUrl = new URL(config.SUPABASE_MIGRATION_DATABASE_URL);
    return {
      host: migrationUrl.hostname,
      port: Number(migrationUrl.port),
      user: decodeURIComponent(migrationUrl.username),
      password: decodeURIComponent(migrationUrl.password),
      database: decodeURIComponent(migrationUrl.pathname.slice(1)),
      ssl: "require",
    };
  } catch {
    throw new SupabaseEnvironmentError("não foi possível preparar credenciais de migration");
  }
}
