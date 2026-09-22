import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { vehiclesTable } from "./vehicles";
import { rentalLeads } from "./rental_leads";

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Dates stay ISO calendar strings; never convert a rental day through a timezone.
export const reservationRequests = pgTable("reservation_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Nullable for requests created before the atomic intake boundary.
  operationId: uuid("operation_id").unique("reservation_requests_operation_id_unique"),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  vehicleId: uuid("vehicle_id").notNull(),
  leadId: uuid("lead_id").notNull(),
  pickupDate: date("pickup_date").notNull(),
  returnDate: date("return_date").notNull(),
  status: text("status", { enum: ["requested", "approved", "rejected", "cancelled"] }).default("requested").notNull(),
  requestNotes: text("request_notes"),
  decisionReason: text("decision_reason"),
  decidedBy: uuid("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  cancelledBy: uuid("cancelled_by"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  ...timestamps(),
}, (t) => [
  unique("reservation_requests_organization_id_id_unique").on(t.organizationId, t.id),
  foreignKey({ name: "reservation_requests_vehicle_tenant_fk", columns: [t.organizationId, t.vehicleId], foreignColumns: [vehiclesTable.organizationId, vehiclesTable.id] }).onDelete("restrict"),
  foreignKey({ name: "reservation_requests_lead_tenant_fk", columns: [t.organizationId, t.leadId], foreignColumns: [rentalLeads.organizationId, rentalLeads.id] }).onDelete("restrict"),
  check("reservation_requests_period_check", sql`${t.pickupDate} < ${t.returnDate} and isfinite(${t.pickupDate}) and isfinite(${t.returnDate})`),
  check("reservation_requests_status_check", sql`${t.status} in ('requested', 'approved', 'rejected', 'cancelled')`),
  check("reservation_requests_notes_check", sql`char_length(${t.requestNotes}) <= 1000 and char_length(${t.decisionReason}) <= 1000`),
  check("reservation_requests_decision_check", sql`(${t.status} = 'requested' and ${t.decidedAt} is null and ${t.decidedBy} is null) or (${t.status} in ('approved', 'rejected') and ${t.decidedAt} is not null and ${t.decidedBy} is not null) or (${t.status} = 'cancelled' and ((${t.decidedAt} is null and ${t.decidedBy} is null) or (${t.decidedAt} is not null and ${t.decidedBy} is not null)))`),
  check("reservation_requests_cancellation_check", sql`(${t.status} = 'cancelled' and ${t.cancelledAt} is not null and ${t.cancelledBy} is not null) or (${t.status} <> 'cancelled' and ${t.cancelledAt} is null and ${t.cancelledBy} is null)`),
  index("reservation_requests_organization_status_idx").on(t.organizationId, t.status, t.createdAt),
  index("reservation_requests_vehicle_idx").on(t.organizationId, t.vehicleId),
  index("reservation_requests_lead_idx").on(t.organizationId, t.leadId),
]).enableRLS();

// The SQL migration also owns the GiST exclusion and lifecycle/integrity triggers.
export const vehicleScheduleBlocks = pgTable("vehicle_schedule_blocks", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  vehicleId: uuid("vehicle_id").notNull(),
  reservationRequestId: uuid("reservation_request_id"),
  kind: text("kind", { enum: ["reservation", "maintenance", "preparation", "manual"] }).notNull(),
  pickupDate: date("pickup_date").notNull(),
  returnDate: date("return_date").notNull(),
  status: text("status", { enum: ["active", "released"] }).default("active").notNull(),
  reason: text("reason"),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  ...timestamps(),
}, (t) => [
  foreignKey({ name: "vehicle_schedule_blocks_vehicle_tenant_fk", columns: [t.organizationId, t.vehicleId], foreignColumns: [vehiclesTable.organizationId, vehiclesTable.id] }).onDelete("restrict"),
  foreignKey({ name: "vehicle_schedule_blocks_request_tenant_fk", columns: [t.organizationId, t.reservationRequestId], foreignColumns: [reservationRequests.organizationId, reservationRequests.id] }).onDelete("restrict"),
  unique("vehicle_schedule_blocks_request_unique").on(t.reservationRequestId),
  check("vehicle_schedule_blocks_period_check", sql`${t.pickupDate} < ${t.returnDate} and isfinite(${t.pickupDate}) and isfinite(${t.returnDate})`),
  check("vehicle_schedule_blocks_kind_check", sql`${t.kind} in ('reservation', 'maintenance', 'preparation', 'manual') and ((${t.kind} = 'reservation') = (${t.reservationRequestId} is not null))`),
  check("vehicle_schedule_blocks_status_check", sql`(${t.status} = 'active' and ${t.releasedAt} is null) or (${t.status} = 'released' and ${t.releasedAt} is not null)`),
  check("vehicle_schedule_blocks_reason_check", sql`char_length(${t.reason}) <= 1000`),
  index("vehicle_schedule_blocks_vehicle_idx").on(t.organizationId, t.vehicleId),
]).enableRLS();

export const waitlistEntries = pgTable("waitlist_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  vehicleId: uuid("vehicle_id"),
  vehiclePreference: text("vehicle_preference"),
  leadId: uuid("lead_id").notNull(),
  pickupDate: date("pickup_date").notNull(),
  returnDate: date("return_date").notNull(),
  status: text("status", { enum: ["waiting", "notified", "cancelled"] }).default("waiting").notNull(),
  ...timestamps(),
}, (t) => [
  foreignKey({ name: "waitlist_entries_vehicle_tenant_fk", columns: [t.organizationId, t.vehicleId], foreignColumns: [vehiclesTable.organizationId, vehiclesTable.id] }).onDelete("restrict"),
  foreignKey({ name: "waitlist_entries_lead_tenant_fk", columns: [t.organizationId, t.leadId], foreignColumns: [rentalLeads.organizationId, rentalLeads.id] }).onDelete("restrict"),
  check("waitlist_entries_period_check", sql`${t.pickupDate} < ${t.returnDate} and isfinite(${t.pickupDate}) and isfinite(${t.returnDate})`),
  check("waitlist_entries_target_check", sql`(${t.vehicleId} is not null) <> (${t.vehiclePreference} is not null) and (${t.vehiclePreference} is null or char_length(trim(${t.vehiclePreference})) between 1 and 200)`),
  check("waitlist_entries_status_check", sql`${t.status} in ('waiting', 'notified', 'cancelled')`),
  index("waitlist_entries_vehicle_idx").on(t.organizationId, t.vehicleId, t.status),
  index("waitlist_entries_lead_idx").on(t.organizationId, t.leadId),
]).enableRLS();

// Only identifiers/event types: no copied contact data or provider error messages.
export const notificationOutbox = pgTable("notification_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  reservationRequestId: uuid("reservation_request_id").notNull(),
  eventType: text("event_type", { enum: ["reservation.requested", "reservation.approved", "reservation.rejected", "reservation.cancelled"] }).notNull(),
  status: text("status", { enum: ["pending", "processing", "failed", "sent"] }).default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code"),
  ...timestamps(),
}, (t) => [
  foreignKey({ name: "notification_outbox_request_tenant_fk", columns: [t.organizationId, t.reservationRequestId], foreignColumns: [reservationRequests.organizationId, reservationRequests.id] }).onDelete("restrict"),
  unique("notification_outbox_event_unique").on(t.reservationRequestId, t.eventType),
  check("notification_outbox_event_check", sql`${t.eventType} in ('reservation.requested', 'reservation.approved', 'reservation.rejected', 'reservation.cancelled')`),
  check("notification_outbox_status_check", sql`${t.status} in ('pending', 'processing', 'failed', 'sent') and ((${t.status} = 'processing') = (${t.lockedAt} is not null)) and ((${t.status} = 'sent') = (${t.sentAt} is not null))`),
  check("notification_outbox_attempts_check", sql`${t.attempts} >= 0`),
  check("notification_outbox_error_check", sql`${t.lastErrorCode} is null or ${t.lastErrorCode} in ('provider_unavailable', 'rate_limited', 'delivery_rejected', 'unknown')`),
  index("notification_outbox_dispatch_idx").on(t.status, t.availableAt).where(sql`${t.status} in ('pending', 'failed')`),
  index("notification_outbox_organization_idx").on(t.organizationId),
]).enableRLS();
