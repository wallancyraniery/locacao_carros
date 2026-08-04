import { foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { leadStatusEnum } from "./enums";
import { rentalLeads } from "./rental_leads";

export const leadStatusHistory = pgTable("lead_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  rentalLeadId: uuid("rental_lead_id").notNull(),
  fromStatus: leadStatusEnum("from_status"),
  toStatus: leadStatusEnum("to_status").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: "lead_status_history_organization_id_fk", columns: [table.organizationId], foreignColumns: [organizations.id] }).onDelete("restrict"),
  foreignKey({ name: "lead_status_history_rental_lead_id_fk", columns: [table.rentalLeadId], foreignColumns: [rentalLeads.id] }).onDelete("restrict"),
  index("lead_status_history_rental_lead_created_at_idx").on(table.rentalLeadId, table.createdAt),
]);
