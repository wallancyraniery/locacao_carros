import { check, foreignKey, index, integer, pgTable, text, timestamp, uuid, boolean, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { vehicleOperationalStatusEnum, vehicleStatusEnum } from "./enums";

export const vehiclesTable = pgTable("vehicles", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  brand: text("brand").notNull(),
  model: text("model").notNull(),
  version: text("version"),
  year: integer("year").notNull(),
  color: text("color").notNull(),
  weeklyPriceCents: integer("weekly_price_cents").notNull(),
  // Legacy compatibility column kept during expand/contract. Do not use it for temporal availability.
  status: vehicleStatusEnum("status").notNull(),
  operationalStatus: vehicleOperationalStatusEnum("operational_status").notNull(),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("vehicles_organization_id_id_unique").on(table.organizationId, table.id),
  foreignKey({ name: "vehicles_organization_id_fk", columns: [table.organizationId], foreignColumns: [organizations.id] }).onDelete("restrict"),
  check("vehicles_weekly_price_cents_non_negative_check", sql`${table.weeklyPriceCents} >= 0`),
  check("vehicles_year_reasonable_check", sql`${table.year} between 1900 and 2200`),
  index("vehicles_organization_id_idx").on(table.organizationId),
  index("vehicles_organization_status_idx").on(table.organizationId, table.status),
  index("vehicles_organization_operational_status_idx").on(table.organizationId, table.operationalStatus),
]);
