import demoVehicles from "./demo_vehicles.json";
import type { Vehicle } from "@/types/vehicle";
import { rentalTerms } from "@/modules/rentals/domain/rental_terms";

export const demoOrganizationId = "10000000-0000-4000-8000-000000000001";

export const vehicles: Vehicle[] = demoVehicles.map((vehicle) => ({
  id: vehicle.id,
  model: vehicle.displayName,
  year: vehicle.year,
  color: vehicle.color,
  weeklyPrice: rentalTerms.weeklyRentalCents / 100,
  status: vehicle.status as Vehicle["status"],
  isConfirmed: vehicle.isConfirmed,
}));

export { demoVehicles };
