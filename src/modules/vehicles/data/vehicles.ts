import demoVehicles from "./demo_vehicles.json";
import type { Vehicle } from "@/types/vehicle";

export const demoOrganizationId = "10000000-0000-4000-8000-000000000001";

export const vehicles: Vehicle[] = demoVehicles.map((vehicle) => ({
  id: vehicle.id,
  model: vehicle.displayName,
  year: vehicle.year,
  color: vehicle.color,
  weeklyPrice: vehicle.weeklyPriceCents / 100,
  status: vehicle.status as Vehicle["status"],
  isConfirmed: vehicle.isConfirmed,
}));

export { demoVehicles };
