import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/modules/database/client.server";
import { organizations, rentalLeads, vehiclesTable } from "@/modules/database/schema";
import { demoOrganizationId } from "@/modules/vehicles/data/vehicles";
import type { LeadRepository, NewLead } from "../domain/lead_repository";
import { runWithLeadRepositoryDiagnostic } from "./lead_repository_diagnostic";

async function runtimeDatabase() {
  return runWithLeadRepositoryDiagnostic("runtime_client_initialization", () => getDatabase());
}

export const drizzleLeadRepository: LeadRepository = {
  async findAvailableDemoVehicle(vehicleId) {
    const database = await runtimeDatabase();
    const [vehicle] = await runWithLeadRepositoryDiagnostic("find_available_demo_vehicle", () => database.select({
      id: vehiclesTable.id,
      organizationId: vehiclesTable.organizationId,
    }).from(vehiclesTable).innerJoin(organizations, eq(organizations.id, vehiclesTable.organizationId)).where(and(
      eq(vehiclesTable.id, vehicleId),
      eq(vehiclesTable.organizationId, demoOrganizationId),
      eq(vehiclesTable.status, "available"),
      eq(vehiclesTable.isDemo, true),
    )).limit(1));
    if (!vehicle) return null;
    return vehicle;
  },

  async createLead(lead: NewLead) {
    const database = await runtimeDatabase();
    const id = randomUUID();
    // Runtime inserts only granted columns; ON CONFLICT makes the opaque operation idempotent.
    await runWithLeadRepositoryDiagnostic("create_lead", () => (
      database.execute(sql`insert into ${rentalLeads} (
        "id", "operation_id", "organization_id", "vehicle_id", "full_name", "phone", "email", "city",
        "has_definitive_license", "usage_purpose", "has_ear", "driver_platform",
        "preferred_contact_time", "status"
      ) values (
        ${id}, ${lead.operationId}, ${lead.organizationId}, ${lead.vehicleId}, ${lead.fullName}, ${lead.phone},
        ${lead.email}, ${lead.city}, ${lead.hasDefinitiveLicense}, ${lead.usagePurpose},
        ${lead.hasEar}, ${lead.driverPlatform}, ${lead.preferredContactTime}, ${"new"}
      ) on conflict do nothing`)
    ));
    return { id };
  },
};
