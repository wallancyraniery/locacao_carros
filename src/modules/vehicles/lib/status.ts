import type { VehicleStatus } from "@/types/vehicle";

export const vehicleStatusLabels: Record<VehicleStatus, string> = { available: "Disponível", reserved: "Reservado", rented: "Alugado", maintenance: "Em manutenção", inactive: "Inativo" };
export const getVehicleStatusLabel = (status: VehicleStatus) => vehicleStatusLabels[status];
