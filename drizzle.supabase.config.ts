import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "drizzle-kit";
import { parseSupabaseMigrationEnvironment } from "./src/config/supabase_environment";

const variables = parseEnv(readFileSync(".env.supabase.local", "utf8"));
const environment = parseSupabaseMigrationEnvironment(variables);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/modules/database/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: environment.SUPABASE_MIGRATION_DATABASE_URL },
  strict: true,
  verbose: false,
});
