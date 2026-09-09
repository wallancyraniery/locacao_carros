export const developmentSeedFixture = Object.freeze({
  organization: Object.freeze({ id: "10000000-0000-4000-8000-000000000001", name: "Locadora demonstrativa", slug: "locadora_demonstrativa" }),
  vehicles: Object.freeze([
    Object.freeze({ id: "20000000-0000-4000-8000-000000000003", organizationId: "10000000-0000-4000-8000-000000000001", brand: "Ford", model: "Fiesta", version: null, year: 2019, color: "Prata", weeklyPriceCents: 70_000, status: "available", isDemo: true }),
    Object.freeze({ id: "20000000-0000-4000-8000-000000000004", organizationId: "10000000-0000-4000-8000-000000000001", brand: "Chevrolet", model: "Onix", version: null, year: 2022, color: "Prata", weeklyPriceCents: 70_000, status: "available", isDemo: true }),
  ]),
});

export class DevelopmentSeedError extends Error {
  constructor(code) {
    super(`Seed local recusado (${code}).`);
    this.name = "DevelopmentSeedError";
    this.code = code;
  }
}

function sameRecord(actual, expected) {
  return actual !== null && typeof actual === "object"
    && Object.entries(expected).every(([field, value]) => actual[field] === value);
}

export function planDevelopmentSeed(observation) {
  if (!observation || !Array.isArray(observation.organizations) || !Array.isArray(observation.vehicles)) {
    throw new DevelopmentSeedError("INVALID_OBSERVATION");
  }
  if (observation.organizations.length > 1) throw new DevelopmentSeedError("ORGANIZATION_IDENTITY_CONFLICT");

  const organization = observation.organizations[0];
  if (organization && !sameRecord(organization, developmentSeedFixture.organization)) {
    throw new DevelopmentSeedError("ORGANIZATION_DIVERGED");
  }

  const expectedVehicles = new Map(developmentSeedFixture.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const observedIds = new Set();
  for (const vehicle of observation.vehicles) {
    const expected = expectedVehicles.get(vehicle?.id);
    if (!expected || observedIds.has(vehicle.id)) throw new DevelopmentSeedError("VEHICLE_IDENTITY_CONFLICT");
    if (!sameRecord(vehicle, expected)) throw new DevelopmentSeedError("VEHICLE_DIVERGED");
    observedIds.add(vehicle.id);
  }

  return {
    insertOrganization: !organization,
    vehiclesToInsert: developmentSeedFixture.vehicles.filter((vehicle) => !observedIds.has(vehicle.id)),
  };
}

export async function provisionDevelopmentSeed(adapter) {
  await adapter.validateStructure();
  const plan = planDevelopmentSeed(await adapter.readFixtureState());
  await adapter.insertMissing(plan, developmentSeedFixture);
  const finalPlan = planDevelopmentSeed(await adapter.readFixtureState());
  if (finalPlan.insertOrganization || finalPlan.vehiclesToInsert.length > 0) {
    throw new DevelopmentSeedError("POST_INSERT_DIVERGENCE");
  }
}
