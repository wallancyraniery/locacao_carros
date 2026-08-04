import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getRuntimeDatabaseEnvironment } from "@/config/runtime_database_environment.server";
import type { RuntimeDatabaseEnvironment } from "@/config/runtime_database_environment";
import * as schema from "./schema";

type DatabaseClient = ReturnType<typeof postgres>;
function createDatabase(sql: DatabaseClient) {
  return drizzle(sql, { schema });
}

type Database = ReturnType<typeof createDatabase>;

const globalDatabase = globalThis as typeof globalThis & {
  localDatabaseSql?: DatabaseClient;
  localDatabase?: Database;
};

let runtimeSql: DatabaseClient | undefined;
let runtimeDatabase: Database | undefined;

export function createRuntimeDatabaseClientConfiguration(
  environment: RuntimeDatabaseEnvironment,
  random: () => number = Math.random,
) {
  if (environment.provider === "local") {
    return {
      url: environment.databaseUrl,
      options: { max: 5, idle_timeout: 20, connect_timeout: 10 },
    } as const;
  }

  const host = new URL(environment.databaseUrl).hostname;
  return {
    url: environment.databaseUrl,
    options: {
      max: 1,
      prepare: false,
      connect_timeout: 5,
      idle_timeout: 8,
      max_lifetime: 300 + Math.floor(random() * 60),
      ssl: {
        ca: environment.sslCa,
        rejectUnauthorized: true,
        servername: host,
      },
    },
  } as const;
}

export function getDatabase(): Database {
  const environment = getRuntimeDatabaseEnvironment();
  if (process.env.NODE_ENV !== "production" && environment.provider === "local" && globalDatabase.localDatabase) {
    return globalDatabase.localDatabase;
  }
  if (runtimeDatabase) return runtimeDatabase;

  const configuration = createRuntimeDatabaseClientConfiguration(environment);
  runtimeSql = postgres(configuration.url, configuration.options);
  runtimeDatabase = createDatabase(runtimeSql);

  if (process.env.NODE_ENV !== "production" && environment.provider === "local") {
    globalDatabase.localDatabaseSql = runtimeSql;
    globalDatabase.localDatabase = runtimeDatabase;
  }
  return runtimeDatabase;
}

export async function closeDatabaseConnection() {
  const sql = runtimeSql ?? globalDatabase.localDatabaseSql;
  if (!sql) return;
  await sql.end();
  runtimeSql = undefined;
  runtimeDatabase = undefined;
  if (globalDatabase.localDatabaseSql === sql) {
    delete globalDatabase.localDatabaseSql;
    delete globalDatabase.localDatabase;
  }
}
