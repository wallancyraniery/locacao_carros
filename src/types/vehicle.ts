export const vehicleStatuses = ["available", "reserved", "rented", "maintenance", "inactive"] as const;
export type VehicleStatus = (typeof vehicleStatuses)[number];
export type Vehicle = {
  id: string;
  model: string;
  year: number | null;
  color: string;
  transmission: "Manual";
  feature: "Completo";
  image: { src: string; alt: string };
  weeklyPrice: number;
  availabilityLabel: "Disponibilidade sob consulta";
  acceptsInterest: true;
};
