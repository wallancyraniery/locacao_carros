import { defineConfig } from "drizzle-kit";
import { parseTestDatabaseEnvironment } from "./src/config/test_database_environment";

const { testDatabaseUrl } = parseTestDatabaseEnvironment(process.env);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/modules/database/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: testDatabaseUrl },
  strict: true,
  verbose: false,
});
