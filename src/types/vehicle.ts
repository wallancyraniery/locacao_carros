export const vehicleStatuses = ["available", "reserved", "rented", "maintenance", "inactive"] as const;
export type VehicleStatus = (typeof vehicleStatuses)[number];
export type Vehicle = { id: string; model: string; year: number; color: string; weeklyPrice: number; status: VehicleStatus; isConfirmed: boolean };
