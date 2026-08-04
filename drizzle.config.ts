import { defineConfig } from "drizzle-kit";
import { parseDatabaseEnvironment } from "./src/config/database_environment";

const environment = parseDatabaseEnvironment(process.env);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/modules/database/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: environment.MIGRATION_DATABASE_URL },
  strict: true,
  verbose: true,
});
