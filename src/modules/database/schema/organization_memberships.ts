import { foreignKey, index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

// Supabase Auth owns the identity lifecycle. Only an administrator associates its subject UUID.
export const organizationMemberships = pgTable("organization_memberships", {
  userId: uuid("user_id").primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: "organization_memberships_organization_id_fk", columns: [table.organizationId], foreignColumns: [organizations.id] }).onDelete("restrict"),
  index("organization_memberships_organization_id_idx").on(table.organizationId),
]);
