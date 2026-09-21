import { describe, expect, it, vi } from "vitest";
import { availabilityRepository } from "@/modules/vehicles/infrastructure/availability_repository.server";

const execute = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/modules/database/client.server", () => ({ getDatabase: () => ({ execute }) }));

describe("repository da disponibilidade", () => {
  const query = {
    vehicleId: "20000000-0000-4000-8000-000000000003",
    pickupDate: "2027-02-01",
    returnDate: "2027-02-02",
  };

  it("consulta a fronteira SQL uma única vez e retorna o boolean", async () => {
    execute.mockResolvedValueOnce([{ available: true }]);
    expect(await availabilityRepository.isAvailable(query)).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("resultado ausente ou inesperado não libera disponibilidade", async () => {
    execute.mockResolvedValueOnce([]);
    expect(await availabilityRepository.isAvailable(query)).toBe(false);
    execute.mockResolvedValueOnce([{ available: null }]);
    expect(await availabilityRepository.isAvailable(query)).toBe(false);
  });
});
