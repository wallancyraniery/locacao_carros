import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vehicles } from "@/modules/vehicles/data/vehicles";
import { VehicleList } from "@/modules/vehicles/components/vehicle_list";
import { getVehicleStatusLabel } from "@/modules/vehicles/lib/status";
import { vehicleStatuses } from "@/types/vehicle";
import { rentalTerms } from "@/modules/rentals/domain/rental_terms";

describe("veículos demonstrativos", () => {
  it("mantém os quatro registros centralizados", () => expect(vehicles).toHaveLength(4));
  it("deriva o preço semanal da fonte única de condições comerciais", () => vehicles.forEach(({ weeklyPrice }) => expect(weeklyPrice * 100).toBe(rentalTerms.weeklyRentalCents)));
  it("preserva todos os estados aceitos", () => expect(vehicleStatuses).toEqual(["available", "reserved", "rented", "maintenance", "inactive"]));
  it("traduz os estados", () => { expect(getVehicleStatusLabel("available")).toBe("Disponível"); expect(getVehicleStatusLabel("maintenance")).toBe("Em manutenção"); });
  it("renderiza os veículos e interesse apenas nos disponíveis", () => { render(<VehicleList />); vehicles.forEach(({ model }) => expect(screen.getByRole("heading", { name: model })).toBeInTheDocument()); expect(screen.getAllByRole("link", { name: "Tenho interesse" })).toHaveLength(2); });
});
