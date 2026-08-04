import "server-only";
import { and, eq } from "drizzle-orm";
import { database } from "@/modules/database/client.server";
import { organizations, rentalLeads, vehiclesTable } from "@/modules/database/schema";
import { demoOrganizationId } from "@/modules/vehicles/data/vehicles";
import type { LeadRepository, NewLead } from "../domain/lead_repository";

export const drizzleLeadRepository: LeadRepository = {
  async findAvailableDemoVehicle(vehicleId) {
    const [vehicle] = await database.select({
      id: vehiclesTable.id,
      organizationId: vehiclesTable.organizationId,
      brand: vehiclesTable.brand,
      model: vehiclesTable.model,
      version: vehiclesTable.version,
    }).from(vehiclesTable).innerJoin(organizations, eq(organizations.id, vehiclesTable.organizationId)).where(and(
      eq(vehiclesTable.id, vehicleId),
      eq(vehiclesTable.organizationId, demoOrganizationId),
      eq(vehiclesTable.status, "available"),
      eq(vehiclesTable.isDemo, true),
    )).limit(1);
    if (!vehicle) return null;
    return { id: vehicle.id, organizationId: vehicle.organizationId, displayName: [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" ") };
  },

  async createLead(lead: NewLead) {
    const [created] = await database.insert(rentalLeads).values({ ...lead, status: "new" }).returning({ id: rentalLeads.id });
    return created;
  },
};
