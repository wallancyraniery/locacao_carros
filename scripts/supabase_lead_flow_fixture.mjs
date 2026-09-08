export const authorizedLeadFlowFixture = Object.freeze({
  organization: Object.freeze({
    id: "10000000-0000-4000-8000-000000000001",
    name: "Locadora demonstrativa - homologação",
    slug: "locadora_demonstrativa_homologacao",
  }),
  vehicle: Object.freeze({
    id: "20000000-0000-4000-8000-000000000003",
    organizationId: "10000000-0000-4000-8000-000000000001",
    brand: "Ford",
    model: "Fiesta",
    version: null,
    year: 2019,
    color: "Prata",
    weeklyPriceCents: 70_000,
    status: "available",
    isDemo: true,
  }),
});

export class LeadFlowFixtureError extends Error {
  constructor(code) {
    super(`Provisionamento da fixture recusado (${code}).`);
    this.name = "LeadFlowFixtureError";
    this.code = code;
  }
}

function sameRecord(actual, expected) {
  const expectedEntries = Object.entries(expected);
  return actual !== null
    && typeof actual === "object"
    && Object.keys(actual).length === expectedEntries.length
    && expectedEntries.every(([field, value]) => actual[field] === value);
}

export function classifyLeadFlowFixtureState(state) {
  if (!state || !Array.isArray(state.organizations) || !Array.isArray(state.vehicles)) {
    throw new LeadFlowFixtureError("INVALID_OBSERVATION");
  }
  if (state.organizations.length > 1 || state.vehicles.length > 1) {
    throw new LeadFlowFixtureError("AMBIGUOUS_STATE");
  }

  const organization = state.organizations[0];
  const vehicle = state.vehicles[0];
  if (!organization && !vehicle) return "empty";
  if (!organization) throw new LeadFlowFixtureError("ORGANIZATION_MISSING");
  if (!vehicle) throw new LeadFlowFixtureError("VEHICLE_MISSING");
  if (!sameRecord(organization, authorizedLeadFlowFixture.organization)) {
    throw new LeadFlowFixtureError("ORGANIZATION_DIVERGED");
  }
  if (!sameRecord(vehicle, authorizedLeadFlowFixture.vehicle)) {
    throw new LeadFlowFixtureError("VEHICLE_DIVERGED");
  }
  return "ready";
}

export async function provisionLeadFlowFixture(adapter) {
  await adapter.validateProject();
  await adapter.validateDatabase();
  await adapter.validateMigrations();
  await adapter.validateStructure();

  const initialState = classifyLeadFlowFixtureState(await adapter.readFixtureState());
  if (initialState === "ready") return { status: "already_provisioned" };

  await adapter.insertFixture(authorizedLeadFlowFixture);
  if (classifyLeadFlowFixtureState(await adapter.readFixtureState()) !== "ready") {
    throw new LeadFlowFixtureError("POST_INSERT_DIVERGENCE");
  }
  return { status: "inserted" };
}
