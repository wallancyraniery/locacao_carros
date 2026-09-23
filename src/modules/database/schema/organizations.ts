import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  city: text("city"),
  dataController: text("data_controller"),
  privacyChannelLabel: text("privacy_channel_label"),
  privacyChannelUrl: text("privacy_channel_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("organizations_slug_unique_idx").on(table.slug)]);
