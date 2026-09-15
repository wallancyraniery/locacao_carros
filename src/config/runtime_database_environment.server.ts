import "server-only";

import { getProductionEnvironment } from "./production_environment.server";
import { parseRuntimeDatabaseEnvironment } from "./runtime_database_environment";

let cachedEnvironment: ReturnType<typeof parseRuntimeDatabaseEnvironment> | undefined;

export function getRuntimeDatabaseEnvironment() {
  cachedEnvironment ??= process.env.NODE_ENV === "production"
    ? getProductionEnvironment().runtimeDatabase
    : parseRuntimeDatabaseEnvironment(process.env);
  return cachedEnvironment;
}
