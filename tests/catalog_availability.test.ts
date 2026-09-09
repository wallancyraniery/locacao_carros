import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";
import * as schema from "@/modules/database/schema";
import { vehicles } from "@/modules/vehicles/data/vehicles";
import { loadCatalogVehicle, loadVehicleCatalog } from "@/modules/vehicles/infrastructure/catalog_availability.server";

const getDatabase = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/modules/database/client.server", () => ({ getDatabase }));

const queryRows = vi.fn();
const unsafe = vi.fn<(query: string, params: unknown[]) => unknown>();

describe("disponibilidade persistida do catálogo", () => {
  beforeEach(() => {
    queryRows.mockReset().mockResolvedValue([[vehicles[2].id]]);
    unsafe.mockReset().mockImplementation(() => Object.assign(Promise.resolve([]), { values: queryRows }));
    const client = { options: { parsers: {}, serializers: {} }, unsafe } as unknown as Sql;
    getDatabase.mockReset().mockReturnValue(drizzle(client, { schema }));
  });

  it("marca como disponível somente o UUID retornado pelo banco", async () => {
    const catalog = await loadVehicleCatalog();
    expect(catalog.filter(({ acceptsInterest }) => acceptsInterest).map(({ id }) => id)).toEqual([vehicles[2].id]);
    expect(catalog.find(({ id }) => id === vehicles[2].id)?.availabilityLabel).toBe("Disponível para interesse");
    expect(catalog.filter(({ acceptsInterest }) => !acceptsInterest)).toHaveLength(3);
  });

  it("consulta apenas IDs do catálogo com os filtros de organização, demo e disponibilidade", async () => {
    await loadVehicleCatalog();
    const [query, params] = unsafe.mock.calls[0];
    expect(query).toContain('select "id" from "vehicles"');
    expect(query).toContain('"organization_id" =');
    expect(query).toContain('"status" =');
    expect(query).toContain('"is_demo" =');
    expect(params).toEqual([...vehicles.map(({ id }) => id), "10000000-0000-4000-8000-000000000001", "available", true]);
  });

  it("falha fechado e registra somente estágio e código seguro", async () => {
    const privateMessage = "valor interno que não deve aparecer";
    queryRows.mockRejectedValueOnce(Object.assign(new Error(privateMessage), { code: "08006", detail: privateMessage }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const catalog = await loadVehicleCatalog();

    expect(catalog.every(({ acceptsInterest }) => !acceptsInterest)).toBe(true);
    expect(consoleError).toHaveBeenCalledWith({ stage: "catalog_availability", code: "08006" });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(privateMessage);
    consoleError.mockRestore();
  });

  it("não consulta o banco para UUID fora do catálogo", async () => {
    await expect(loadCatalogVehicle("30000000-0000-4000-8000-000000000099")).resolves.toBeUndefined();
    expect(getDatabase).not.toHaveBeenCalled();
  });
});
