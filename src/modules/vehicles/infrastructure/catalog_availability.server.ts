import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { getDatabase } from "@/modules/database/client.server";
import { safeDatabaseErrorCode } from "@/modules/database/safe_error_code";
import { vehiclesTable } from "@/modules/database/schema";
import type { Vehicle } from "@/types/vehicle";
import { demoOrganizationId, vehicles } from "../data/vehicles";

function applyAvailability(availableIds: ReadonlySet<string>): Vehicle[] {
  return vehicles.map((vehicle) => {
    const acceptsInterest = availableIds.has(vehicle.id);
    return {
      ...vehicle,
      acceptsInterest,
      availabilityLabel: acceptsInterest ? "Disponível para interesse" : "Interesse indisponível",
    };
  });
}

export async function loadVehicleCatalog(): Promise<Vehicle[]> {
  try {
    const database = getDatabase();
    const available = await database.select({ id: vehiclesTable.id }).from(vehiclesTable).where(and(
      inArray(vehiclesTable.id, vehicles.map(({ id }) => id)),
      eq(vehiclesTable.organizationId, demoOrganizationId),
      eq(vehiclesTable.status, "available"),
      eq(vehiclesTable.isDemo, true),
    ));
    return applyAvailability(new Set(available.map(({ id }) => id)));
  } catch (error) {
    console.error({ stage: "catalog_availability", code: safeDatabaseErrorCode(error) });
    return applyAvailability(new Set());
  }
}

export async function loadCatalogVehicle(id: string): Promise<Vehicle | undefined> {
  if (!vehicles.some((vehicle) => vehicle.id === id)) return undefined;
  return (await loadVehicleCatalog()).find((vehicle) => vehicle.id === id);
}
