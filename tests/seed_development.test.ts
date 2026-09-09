import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  developmentSeedFixture,
  planDevelopmentSeed,
  provisionDevelopmentSeed,
  type DevelopmentSeedAdapter,
  type DevelopmentSeedFixture,
  type DevelopmentSeedObservation,
  type DevelopmentSeedPlan,
} from "../scripts/development_seed_fixture.mjs";

function exactObservation(): DevelopmentSeedObservation {
  return { organizations: [{ ...developmentSeedFixture.organization }], vehicles: developmentSeedFixture.vehicles.map((vehicle) => ({ ...vehicle })) };
}

function adapterFor(initial: DevelopmentSeedObservation) {
  let observation = initial;
  const events: string[] = [];
  const adapter: DevelopmentSeedAdapter = {
    validateStructure: vi.fn(async () => { events.push("validateStructure"); }),
    readFixtureState: vi.fn(async () => { events.push("readFixtureState"); return observation; }),
    insertMissing: vi.fn(async (plan: DevelopmentSeedPlan, fixture: DevelopmentSeedFixture) => {
      events.push("insertMissing");
      observation = {
        organizations: plan.insertOrganization ? [{ ...fixture.organization }] : observation.organizations,
        vehicles: [...observation.vehicles, ...plan.vehiclesToInsert.map((vehicle) => ({ ...vehicle }))],
      };
    }),
  };
  return { adapter, events };
}

describe("seed de desenvolvimento", () => {
  it("define exatamente os dois veículos autorizados pelo contrato", () => {
    expect(developmentSeedFixture.vehicles).toEqual([
      expect.objectContaining({ id: "20000000-0000-4000-8000-000000000003", model: "Fiesta", year: 2019, status: "available" }),
      expect.objectContaining({ id: "20000000-0000-4000-8000-000000000004", model: "Onix", year: 2022, status: "available" }),
    ]);
    expect(developmentSeedFixture.vehicles.every((vehicle) => vehicle.organizationId === developmentSeedFixture.organization.id && vehicle.weeklyPriceCents === 70_000 && vehicle.isDemo)).toBe(true);
  });

  it("valida a estrutura antes de observar ou escrever", async () => {
    const { adapter, events } = adapterFor({ organizations: [], vehicles: [] });
    vi.mocked(adapter.validateStructure).mockRejectedValueOnce(new Error("schema ausente"));
    await expect(provisionDevelopmentSeed(adapter)).rejects.toThrow("schema ausente");
    expect(events).toEqual([]);
    expect(adapter.insertMissing).not.toHaveBeenCalled();
  });

  it("insere a organização e os dois veículos ausentes", async () => {
    const { adapter, events } = adapterFor({ organizations: [], vehicles: [] });
    await expect(provisionDevelopmentSeed(adapter)).resolves.toBeUndefined();
    expect(events).toEqual(["validateStructure", "readFixtureState", "insertMissing", "readFixtureState"]);
    expect(adapter.insertMissing).toHaveBeenCalledWith({ insertOrganization: true, vehiclesToInsert: developmentSeedFixture.vehicles }, developmentSeedFixture);
  });

  it("recusa conflito da organização sem escrever", async () => {
    const observation = exactObservation();
    observation.organizations[0].name = "Outra organização";
    const { adapter } = adapterFor(observation);
    await expect(provisionDevelopmentSeed(adapter)).rejects.toMatchObject({ code: "ORGANIZATION_DIVERGED" });
    expect(adapter.insertMissing).not.toHaveBeenCalled();
  });

  it("recusa divergência em veículo sem escrever", async () => {
    const observation = exactObservation();
    observation.vehicles[1].year = 2021;
    const { adapter } = adapterFor(observation);
    await expect(provisionDevelopmentSeed(adapter)).rejects.toMatchObject({ code: "VEHICLE_DIVERGED" });
    expect(adapter.insertMissing).not.toHaveBeenCalled();
  });

  it("planeja somente registros ausentes", () => {
    const observation = exactObservation();
    observation.vehicles.pop();
    expect(planDevelopmentSeed(observation)).toEqual({ insertOrganization: false, vehiclesToInsert: [developmentSeedFixture.vehicles[1]] });
  });

  it("não usa escrita corretiva nem o catálogo editorial", () => {
    const source = readFileSync("scripts/seed_development.mjs", "utf8");
    const writes = [...source.matchAll(/transaction`\s*(INSERT|UPDATE|DELETE)/gi)].map((match) => match[1].toUpperCase());
    expect(writes).toEqual(["INSERT", "INSERT"]);
    expect(source).not.toMatch(/ON\s+CONFLICT|\bUPDATE\b|\bDELETE\b/i);
    expect(source).not.toContain("demo_vehicles.json");
    expect(source).toContain("sql.begin");
  });
});
