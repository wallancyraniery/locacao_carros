import "server-only";

import { parseRuntimeDatabaseEnvironment } from "./runtime_database_environment";

let cachedEnvironment: ReturnType<typeof parseRuntimeDatabaseEnvironment> | undefined;

export function getRuntimeDatabaseEnvironment() {
  cachedEnvironment ??= parseRuntimeDatabaseEnvironment(process.env);
  return cachedEnvironment;
}
