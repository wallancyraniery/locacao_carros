import demoVehicles from "./demo_vehicles.json";
import type { Vehicle } from "@/types/vehicle";
import { rentalTerms } from "@/modules/rentals/domain/rental_terms";

export const demoOrganizationId = "10000000-0000-4000-8000-000000000001";

export const vehicles: Vehicle[] = demoVehicles.map((vehicle) => ({
  id: vehicle.id,
  model: vehicle.displayName,
  year: vehicle.year,
  color: vehicle.color,
  transmission: vehicle.transmission as Vehicle["transmission"],
  feature: vehicle.feature as Vehicle["feature"],
  image: { src: vehicle.imageSrc, alt: vehicle.imageAlt },
  weeklyPrice: rentalTerms.weeklyRentalCents / 100,
  availabilityLabel: "Disponibilidade sob consulta",
  acceptsInterest: true,
}));

export { demoVehicles };
