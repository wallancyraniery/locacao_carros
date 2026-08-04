import { pgEnum } from "drizzle-orm/pg-core";
import { vehicleStatuses } from "@/types/vehicle";

export const vehicleStatusEnum = pgEnum("vehicle_status", vehicleStatuses);

export const leadStatuses = ["new", "contacted", "under_review", "approved", "rejected", "converted"] as const;
export const leadStatusEnum = pgEnum("lead_status", leadStatuses);
