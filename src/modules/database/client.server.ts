import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseEnvironment } from "@/config/database_environment.server";
import * as schema from "./schema";

const globalDatabase = globalThis as typeof globalThis & { databaseSql?: ReturnType<typeof postgres> };

const sql = globalDatabase.databaseSql ?? postgres(getDatabaseEnvironment().DATABASE_URL, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

if (process.env.NODE_ENV !== "production") globalDatabase.databaseSql = sql;

export const database = drizzle(sql, { schema });

export async function closeDatabaseConnection() {
  await sql.end();
  if (globalDatabase.databaseSql === sql) delete globalDatabase.databaseSql;
}
