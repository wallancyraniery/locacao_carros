import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { vehiclesTable } from "./vehicles";

export const vehicleImagesTable = pgTable("vehicle_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  vehicleId: uuid("vehicle_id").notNull(),
  storagePath: text("storage_path").notNull(),
  status: text("status").default("prepared").notNull(),
  position: integer("position"),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  width: integer("width"),
  height: integer("height"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    name: "vehicle_images_vehicle_tenant_fk",
    columns: [table.organizationId, table.vehicleId],
    foreignColumns: [vehiclesTable.organizationId, vehiclesTable.id],
  }).onDelete("restrict"),
  uniqueIndex("vehicle_images_storage_path_unique_idx").on(table.storagePath),
  uniqueIndex("vehicle_images_ready_position_unique_idx")
    .on(table.vehicleId, table.position)
    .where(sql`${table.status} = 'ready'`),
  index("vehicle_images_vehicle_status_idx").on(table.vehicleId, table.status),
  index("vehicle_images_organization_vehicle_idx").on(table.organizationId, table.vehicleId),
  check("vehicle_images_status_check", sql`${table.status} in ('prepared', 'ready', 'deleting', 'deleted')`),
  check("vehicle_images_position_check", sql`${table.position} is null or ${table.position} between 0 and 7`),
  check("vehicle_images_mime_type_check", sql`${table.mimeType} in ('image/jpeg', 'image/png', 'image/webp')`),
  check("vehicle_images_byte_size_check", sql`${table.byteSize} between 1 and 5242880`),
  check("vehicle_images_width_check", sql`${table.width} is null or ${table.width} > 0`),
  check("vehicle_images_height_check", sql`${table.height} is null or ${table.height} > 0`),
  check("vehicle_images_lifecycle_check", sql`
    (${table.status} = 'prepared' and ${table.position} is null and ${table.width} is null and ${table.height} is null and ${table.expiresAt} is not null)
    or (${table.status} = 'ready' and ${table.position} is not null and ${table.width} is not null and ${table.height} is not null and ${table.expiresAt} is null)
    or (${table.status} in ('deleting', 'deleted') and ${table.position} is null and ${table.expiresAt} is null)
  `),
]);
