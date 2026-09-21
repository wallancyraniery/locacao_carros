import { pgEnum } from "drizzle-orm/pg-core";
import { vehicleOperationalStatuses, vehicleStatuses } from "@/types/vehicle";

// Legacy compatibility enum. Temporal availability now belongs to vehicle_schedule_blocks.
export const vehicleStatusEnum = pgEnum("vehicle_status", vehicleStatuses);
export const vehicleOperationalStatusEnum = pgEnum("vehicle_operational_status", vehicleOperationalStatuses);

export const leadStatuses = ["new", "contacted", "under_review", "approved", "rejected", "converted"] as const;
export const leadStatusEnum = pgEnum("lead_status", leadStatuses);
