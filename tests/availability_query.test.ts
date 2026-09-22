import { describe, expect, it, vi } from "vitest";
import { availabilityQuerySchema } from "@/modules/vehicles/domain/availability_period";
import { checkAvailability } from "@/modules/vehicles/application/check_availability.server";
import { queryAvailability } from "@/modules/vehicles/application/query_availability.server";
import type { AvailabilityRepository } from "@/modules/vehicles/domain/availability_repository";

vi.mock("server-only", () => ({}));

const valid = {
  vehicleId: "20000000-0000-4000-8000-000000000003",
  pickupDate: "2027-02-01",
  returnDate: "2027-02-02",
};

describe("consulta de disponibilidade", () => {
  it("aceita datas civis ISO e intervalo semiaberto positivo", () => {
    expect(availabilityQuerySchema.safeParse(valid).success).toBe(true);
    expect(availabilityQuerySchema.safeParse({
      ...valid,
      pickupDate: "2028-02-29",
      returnDate: "2028-03-01",
    }).success).toBe(true);
  });

  it.each([
    { ...valid, pickupDate: "2027-02-02" },
    { ...valid, pickupDate: "2027-02-03" },
    { ...valid, pickupDate: "2027-02-30" },
    { ...valid, pickupDate: "2027-2-01" },
    { ...valid, pickupDate: "2027-02-01T00:00:00Z" },
    { ...valid, vehicleId: "outro" },
  ])("recusa entrada inválida sem chamar o banco: %j", async (input) => {
    const isAvailable = vi.fn();
    expect(await queryAvailability({ isAvailable }, input)).toEqual({ status: "invalid" });
    expect(await checkAvailability({ isAvailable }, input)).toBe(false);
    expect(isAvailable).not.toHaveBeenCalled();
  });

  it.each([true, false])("distingue o resultado %s do repository", async (available) => {
    const isAvailable = vi.fn().mockResolvedValue(available);
    expect(await queryAvailability({ isAvailable }, valid)).toEqual({ status: available ? "available" : "unavailable" });
    expect(isAvailable).toHaveBeenCalledExactlyOnceWith(valid);
  });

  it("classifica falha técnica como error sem expor detalhes", async () => {
    const isAvailable = vi.fn().mockRejectedValue(new Error("SQL privado"));
    expect(await queryAvailability({ isAvailable }, valid)).toEqual({ status: "error" });
  });

  it("retorna exclusivamente o boolean da consulta", async () => {
    const isAvailable = vi.fn<AvailabilityRepository["isAvailable"]>().mockResolvedValue(true);
    expect(await checkAvailability({ isAvailable }, valid)).toBe(true);
    expect(isAvailable).toHaveBeenCalledWith(valid);
    isAvailable.mockResolvedValueOnce(false);
    expect(await checkAvailability({ isAvailable }, valid)).toBe(false);
  });

  it("falha fechada diante de erro de infraestrutura", async () => {
    const isAvailable = vi.fn<AvailabilityRepository["isAvailable"]>().mockRejectedValue(new Error("falha privada"));
    await expect(checkAvailability({ isAvailable }, valid)).resolves.toBe(false);
  });
});
