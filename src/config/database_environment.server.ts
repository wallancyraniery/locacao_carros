import { parseDatabaseEnvironment } from "./database_environment";

if (typeof window !== "undefined") {
  throw new Error("A configuração de banco está disponível somente no servidor.");
}

let cachedEnvironment: ReturnType<typeof parseDatabaseEnvironment> | undefined;

export function getDatabaseEnvironment() {
  cachedEnvironment ??= parseDatabaseEnvironment(process.env);
  return cachedEnvironment;
}
