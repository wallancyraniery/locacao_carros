import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

// Supabase Auth owns identity; the controlled onboarding boundary creates the initial owner.
export const organizationMemberships = pgTable("organization_memberships", {
  userId: uuid("user_id").primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("organization_memberships_role_check", sql`${table.role} in ('owner', 'member')`),
  foreignKey({ name: "organization_memberships_organization_id_fk", columns: [table.organizationId], foreignColumns: [organizations.id] }).onDelete("restrict"),
  index("organization_memberships_organization_id_idx").on(table.organizationId),
]);
