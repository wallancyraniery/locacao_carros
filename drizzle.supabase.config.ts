import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "drizzle-kit";
import { createSupabaseMigrationCredentials, parseSupabaseMigrationEnvironment } from "./src/config/supabase_environment";

const variables = parseEnv(readFileSync(".env.supabase.local", "utf8"));
const environment = parseSupabaseMigrationEnvironment(variables);
const credentials = createSupabaseMigrationCredentials(environment);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/modules/database/schema/index.ts",
  out: "./drizzle",
  dbCredentials: credentials,
  strict: true,
  verbose: false,
});
