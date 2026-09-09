const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export class DevelopmentSeedEnvironmentError extends Error {
  constructor(code) {
    super(`Configuração do seed local recusada (${code}).`);
    this.name = "DevelopmentSeedEnvironmentError";
    this.code = code;
  }
}

export function parseDevelopmentSeedEnvironment(environment) {
  if (!environment.DATABASE_URL || !environment.POSTGRES_DB) {
    throw new DevelopmentSeedEnvironmentError("INCOMPLETE");
  }

  let url;
  try {
    url = new URL(environment.DATABASE_URL);
  } catch {
    throw new DevelopmentSeedEnvironmentError("INVALID_URL");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new DevelopmentSeedEnvironmentError("INVALID_PROTOCOL");
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName || databaseName.includes("/")) {
    throw new DevelopmentSeedEnvironmentError("INVALID_DATABASE");
  }
  if (!localHosts.has(url.hostname.toLowerCase())) {
    throw new DevelopmentSeedEnvironmentError("REMOTE_HOST");
  }
  if (databaseName !== environment.POSTGRES_DB) {
    throw new DevelopmentSeedEnvironmentError("DATABASE_MISMATCH");
  }

  return { databaseUrl: url.href };
}
