import { z } from "zod";

const databaseUrlSchema = z
  .string({ error: "variável obrigatória" })
  .trim()
  .min(1, "valor vazio")
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "postgres:" || protocol === "postgresql:";
    } catch {
      return false;
    }
  }, "deve ser uma URL PostgreSQL válida");

const databaseEnvironmentSchema = z.object({
  POSTGRES_DB: z.string().trim().min(1, "valor vazio"),
  POSTGRES_USER: z.string().trim().min(1, "valor vazio"),
  POSTGRES_PASSWORD: z.string().min(1, "valor vazio"),
  DATABASE_URL: databaseUrlSchema,
  MIGRATION_DATABASE_URL: databaseUrlSchema,
});

export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;

export class DatabaseEnvironmentError extends Error {
  readonly code = "INVALID_DATABASE_ENVIRONMENT";

  constructor(fields: string[]) {
    super(`Configuração de banco inválida nos campos: ${fields.join(", ")}`);
    this.name = "DatabaseEnvironmentError";
  }
}

export function parseDatabaseEnvironment(environment: Record<string, string | undefined>): DatabaseEnvironment {
  const result = databaseEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "desconhecido")))];
    throw new DatabaseEnvironmentError(fields);
  }

  return result.data;
}
