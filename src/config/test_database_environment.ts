import { z } from "zod";

const postgresqlUrlSchema = z
  .string({ error: "variável obrigatória" })
  .trim()
  .min(1, "valor vazio")
  .transform((value, context) => {
    try {
      const url = new URL(value);
      if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
        context.addIssue({ code: "custom", message: "protocolo inválido" });
        return z.NEVER;
      }
      return url;
    } catch {
      context.addIssue({ code: "custom", message: "URL inválida" });
      return z.NEVER;
    }
  });

const testDatabaseEnvironmentSchema = z.object({
  DATABASE_URL: postgresqlUrlSchema,
  MIGRATION_DATABASE_URL: postgresqlUrlSchema,
  TEST_DATABASE_URL: postgresqlUrlSchema,
});

export type TestDatabaseEnvironment = {
  testDatabaseUrl: string;
  testDatabaseName: string;
};

export class TestDatabaseEnvironmentError extends Error {
  readonly code = "UNSAFE_TEST_DATABASE_ENVIRONMENT";

  constructor(reason: string) {
    super(`Configuração do banco PostgreSQL de testes recusada: ${reason}.`);
    this.name = "TestDatabaseEnvironmentError";
  }
}

function databaseName(url: URL) {
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!name || name.includes("/")) throw new TestDatabaseEnvironmentError("nome do banco inválido");
  return name;
}

export function parseTestDatabaseEnvironment(
  environment: Record<string, string | undefined>,
): TestDatabaseEnvironment {
  const result = testDatabaseEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "desconhecido")))];
    throw new TestDatabaseEnvironmentError(`variáveis inválidas: ${fields.join(", ")}`);
  }

  const { DATABASE_URL, MIGRATION_DATABASE_URL, TEST_DATABASE_URL } = result.data;
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

  if (!localHosts.has(TEST_DATABASE_URL.hostname.toLowerCase())) {
    throw new TestDatabaseEnvironmentError("o host de testes deve ser local");
  }

  const testName = databaseName(TEST_DATABASE_URL);
  const applicationName = databaseName(DATABASE_URL);
  const migrationName = databaseName(MIGRATION_DATABASE_URL);

  if (!testName.endsWith("_test")) {
    throw new TestDatabaseEnvironmentError("o nome do banco deve terminar em _test");
  }

  if (testName === applicationName || testName === migrationName) {
    throw new TestDatabaseEnvironmentError("o banco de testes deve ser diferente dos bancos principais");
  }

  if (TEST_DATABASE_URL.href === DATABASE_URL.href || TEST_DATABASE_URL.href === MIGRATION_DATABASE_URL.href) {
    throw new TestDatabaseEnvironmentError("a URL de testes deve ser exclusiva");
  }

  return { testDatabaseUrl: TEST_DATABASE_URL.href, testDatabaseName: testName };
}
