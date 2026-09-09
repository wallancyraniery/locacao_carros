export type DevelopmentSeedOrganization = { id: string; name: string; slug: string };
export type DevelopmentSeedVehicle = {
  id: string; organizationId: string; brand: string; model: string; version: string | null;
  year: number; color: string; weeklyPriceCents: number; status: "available"; isDemo: true;
};
export type DevelopmentSeedFixture = { organization: DevelopmentSeedOrganization; vehicles: readonly DevelopmentSeedVehicle[] };
export type DevelopmentSeedObservation = { organizations: DevelopmentSeedOrganization[]; vehicles: DevelopmentSeedVehicle[] };
export type DevelopmentSeedPlan = { insertOrganization: boolean; vehiclesToInsert: readonly DevelopmentSeedVehicle[] };
export type DevelopmentSeedAdapter = {
  validateStructure(): Promise<void>;
  readFixtureState(): Promise<DevelopmentSeedObservation>;
  insertMissing(plan: DevelopmentSeedPlan, fixture: DevelopmentSeedFixture): Promise<void>;
};
export const developmentSeedFixture: DevelopmentSeedFixture;
export class DevelopmentSeedError extends Error { readonly code: string; constructor(code: string); }
export function planDevelopmentSeed(observation: DevelopmentSeedObservation): DevelopmentSeedPlan;
export function provisionDevelopmentSeed(adapter: DevelopmentSeedAdapter): Promise<void>;
