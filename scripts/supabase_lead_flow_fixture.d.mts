export type LeadFlowOrganization = {
  id: string;
  name: string;
  slug: string;
};

export type LeadFlowVehicle = {
  id: string;
  organizationId: string;
  brand: string;
  model: string;
  version: string | null;
  year: number;
  color: string;
  weeklyPriceCents: number;
  status: string;
  isDemo: boolean;
};

export type LeadFlowFixture = {
  organization: LeadFlowOrganization;
  vehicle: LeadFlowVehicle;
};

export type LeadFlowFixtureObservation = {
  organizations: LeadFlowOrganization[];
  vehicles: LeadFlowVehicle[];
};

export type LeadFlowFixtureAdapter = {
  validateProject(): Promise<void>;
  validateDatabase(): Promise<void>;
  validateMigrations(): Promise<void>;
  validateStructure(): Promise<void>;
  readFixtureState(): Promise<LeadFlowFixtureObservation>;
  insertFixture(fixture: LeadFlowFixture): Promise<void>;
};

export declare const authorizedLeadFlowFixture: Readonly<{
  organization: Readonly<LeadFlowOrganization>;
  vehicle: Readonly<LeadFlowVehicle>;
}>;

export declare class LeadFlowFixtureError extends Error {
  readonly code: string;
  constructor(code: string);
}

export declare function classifyLeadFlowFixtureState(
  state: LeadFlowFixtureObservation,
): "empty" | "ready";

export declare function provisionLeadFlowFixture(
  adapter: LeadFlowFixtureAdapter,
): Promise<{ status: "already_provisioned" | "inserted" }>;
