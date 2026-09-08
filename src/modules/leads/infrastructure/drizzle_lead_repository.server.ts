import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/modules/database/client.server";
import { organizations, rentalLeads, vehiclesTable } from "@/modules/database/schema";
import { demoOrganizationId } from "@/modules/vehicles/data/vehicles";
import type { LeadRepository, NewLead } from "../domain/lead_repository";

export const drizzleLeadRepository: LeadRepository = {
  async findAvailableDemoVehicle(vehicleId) {
    const database = getDatabase();
    const [vehicle] = await database.select({
      id: vehiclesTable.id,
      organizationId: vehiclesTable.organizationId,
    }).from(vehiclesTable).innerJoin(organizations, eq(organizations.id, vehiclesTable.organizationId)).where(and(
      eq(vehiclesTable.id, vehicleId),
      eq(vehiclesTable.organizationId, demoOrganizationId),
      eq(vehiclesTable.status, "available"),
      eq(vehiclesTable.isDemo, true),
    )).limit(1);
    if (!vehicle) return null;
    return vehicle;
  },

  async createLead(lead: NewLead) {
    const database = getDatabase();
    const id = randomUUID();
    await database.insert(rentalLeads).values({ id, ...lead, status: "new" });
    return { id };
  },
};
