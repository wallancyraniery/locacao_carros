import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { vehiclesTable } from "./vehicles";
import { leadStatusEnum } from "./enums";

export const rentalLeads = pgTable("rental_leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  vehicleId: uuid("vehicle_id"),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  city: text("city").notNull(),
  hasDefinitiveLicense: boolean("has_definitive_license").notNull(),
  usagePurpose: text("usage_purpose"),
  hasEar: boolean("has_ear"),
  driverPlatform: text("driver_platform"),
  preferredContactTime: text("preferred_contact_time"),
  status: leadStatusEnum("status").default("new").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: "rental_leads_organization_id_fk", columns: [table.organizationId], foreignColumns: [organizations.id] }).onDelete("restrict"),
  foreignKey({ name: "rental_leads_vehicle_id_fk", columns: [table.vehicleId], foreignColumns: [vehiclesTable.id] }).onDelete("restrict"),
  check("rental_leads_usage_purpose_check", sql`${table.usagePurpose} is null or ${table.usagePurpose} in ('professional_app', 'other')`),
  index("rental_leads_organization_id_idx").on(table.organizationId),
  index("rental_leads_organization_status_idx").on(table.organizationId, table.status),
  index("rental_leads_organization_created_at_idx").on(table.organizationId, table.createdAt),
]);
