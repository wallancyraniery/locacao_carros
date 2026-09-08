import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["scripts/check_supabase_runtime.ts"],
    fileParallelism: false,
    // Allow the remote read-only audit and client cleanup to complete.
    testTimeout: 60_000,
  },
});
