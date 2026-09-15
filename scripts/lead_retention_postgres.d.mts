import type { LeadRetentionAdapter } from "./lead_retention.mjs";
export function createPostgresLeadRetentionAdapter(sql: unknown, validations: Pick<LeadRetentionAdapter, "validateTarget" | "validateMigrations" | "validateStructure">): LeadRetentionAdapter;
