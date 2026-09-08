import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  authorizedLeadFlowFixture,
  classifyLeadFlowFixtureState,
  LeadFlowFixtureError,
  provisionLeadFlowFixture,
  type LeadFlowFixture,
  type LeadFlowFixtureAdapter,
  type LeadFlowFixtureObservation,
} from "../scripts/supabase_lead_flow_fixture.mjs";

function exactObservation(): LeadFlowFixtureObservation {
  return {
    organizations: [{ ...authorizedLeadFlowFixture.organization }],
    vehicles: [{ ...authorizedLeadFlowFixture.vehicle }],
  };
}

function emptyObservation(): LeadFlowFixtureObservation {
  return { organizations: [], vehicles: [] };
}

function adapterFor(initial: LeadFlowFixtureObservation) {
  const events: string[] = [];
  let observation = initial;
  const adapter: LeadFlowFixtureAdapter = {
    validateProject: vi.fn(async () => { events.push("validateProject"); }),
    validateDatabase: vi.fn(async () => { events.push("validateDatabase"); }),
    validateMigrations: vi.fn(async () => { events.push("validateMigrations"); }),
    validateStructure: vi.fn(async () => { events.push("validateStructure"); }),
    readFixtureState: vi.fn(async () => {
      events.push("readFixtureState");
      return observation;
    }),
    insertFixture: vi.fn(async (fixture: LeadFlowFixture) => {
      events.push("insertFixture");
      observation = {
        organizations: [{ ...fixture.organization }],
        vehicles: [{ ...fixture.vehicle }],
      };
    }),
  };
  return { adapter, events };
}

describe("fixture remota controlada do fluxo de leads", () => {
  it("insere os dois registros somente depois de todas as validações", async () => {
    const { adapter, events } = adapterFor(emptyObservation());

    await expect(provisionLeadFlowFixture(adapter)).resolves.toEqual({ status: "inserted" });
    expect(events).toEqual([
      "validateProject",
      "validateDatabase",
      "validateMigrations",
      "validateStructure",
      "readFixtureState",
      "insertFixture",
      "readFixtureState",
    ]);
    expect(adapter.insertFixture).toHaveBeenCalledOnce();
    expect(adapter.insertFixture).toHaveBeenCalledWith(authorizedLeadFlowFixture);
  });

  it("não escreve quando os dois registros já são exatamente os autorizados", async () => {
    const { adapter } = adapterFor(exactObservation());

    await expect(provisionLeadFlowFixture(adapter)).resolves.toEqual({ status: "already_provisioned" });
    expect(adapter.insertFixture).not.toHaveBeenCalled();
  });

  it("aborta se somente a organização existir", async () => {
    const { adapter } = adapterFor({ organizations: exactObservation().organizations, vehicles: [] });

    await expect(provisionLeadFlowFixture(adapter)).rejects.toMatchObject({ code: "VEHICLE_MISSING" });
    expect(adapter.insertFixture).not.toHaveBeenCalled();
  });

  it("aborta se somente o veículo existir", async () => {
    const { adapter } = adapterFor({ organizations: [], vehicles: exactObservation().vehicles });

    await expect(provisionLeadFlowFixture(adapter)).rejects.toMatchObject({ code: "ORGANIZATION_MISSING" });
    expect(adapter.insertFixture).not.toHaveBeenCalled();
  });

  it.each(Object.keys(authorizedLeadFlowFixture.organization))(
    "aborta se o campo organization.%s divergir",
    async (field) => {
      const observation = exactObservation();
      observation.organizations[0] = { ...observation.organizations[0], [field]: "valor_divergente" };
      const { adapter } = adapterFor(observation);

      await expect(provisionLeadFlowFixture(adapter)).rejects.toMatchObject({ code: "ORGANIZATION_DIVERGED" });
      expect(adapter.insertFixture).not.toHaveBeenCalled();
    },
  );

  it.each(Object.keys(authorizedLeadFlowFixture.vehicle))(
    "aborta se o campo vehicle.%s divergir",
    async (field) => {
      const observation = exactObservation();
      observation.vehicles[0] = { ...observation.vehicles[0], [field]: "valor_divergente" } as typeof observation.vehicles[0];
      const { adapter } = adapterFor(observation);

      await expect(provisionLeadFlowFixture(adapter)).rejects.toMatchObject({ code: "VEHICLE_DIVERGED" });
      expect(adapter.insertFixture).not.toHaveBeenCalled();
    },
  );

  it.each([
    "validateProject",
    "validateDatabase",
    "validateMigrations",
    "validateStructure",
  ] as const)("não escreve quando %s falha", async (validation) => {
    const { adapter } = adapterFor(emptyObservation());
    vi.mocked(adapter[validation]).mockRejectedValueOnce(new LeadFlowFixtureError("VALIDATION_FAILURE"));

    await expect(provisionLeadFlowFixture(adapter)).rejects.toMatchObject({ code: "VALIDATION_FAILURE" });
    expect(adapter.insertFixture).not.toHaveBeenCalled();
  });

  it("recusa observações ambíguas sem escrever", async () => {
    const observation = exactObservation();
    observation.organizations.push({ ...authorizedLeadFlowFixture.organization });
    const { adapter } = adapterFor(observation);

    await expect(provisionLeadFlowFixture(adapter)).rejects.toMatchObject({ code: "AMBIGUOUS_STATE" });
    expect(adapter.insertFixture).not.toHaveBeenCalled();
  });

  it("aborta a transação lógica se a conferência posterior à inserção divergir", async () => {
    const { adapter } = adapterFor(emptyObservation());
    vi.mocked(adapter.insertFixture).mockResolvedValueOnce();

    await expect(provisionLeadFlowFixture(adapter)).rejects.toMatchObject({ code: "POST_INSERT_DIVERGENCE" });
    expect(adapter.insertFixture).toHaveBeenCalledOnce();
  });

  it("expõe somente estados idempotentes aprovados", () => {
    expect(classifyLeadFlowFixtureState(emptyObservation())).toBe("empty");
    expect(classifyLeadFlowFixtureState(exactObservation())).toBe("ready");
  });

  it("mantém o executável sem correção destrutiva ou escrita fora da transação", () => {
    const source = readFileSync("scripts/provision_supabase_lead_flow_fixture.mjs", "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const writeStatements = [...source.matchAll(/transaction`\s*(INSERT|UPDATE|DELETE)/g)].map((match) => match[1]);

    expect(writeStatements).toEqual(["INSERT", "INSERT"]);
    expect(source).not.toMatch(/ON\s+CONFLICT/i);
    expect(source).toContain("sql.begin");
    expect(source).toContain("rejectUnauthorized: true");
    expect(source).toContain("servername: adminUrl.hostname");
    expect(source).toContain("port: 5432");
    expect(source).not.toContain(".env.supabase.runtime.local");
    expect(source).not.toContain("rental_leads");
    expect(packageJson.scripts["db:provision:supabase:lead-flow-fixture"])
      .toBe("node scripts/provision_supabase_lead_flow_fixture.mjs");
    expect(packageJson.scripts["db:provision:supabase:lead-flow-fixture"])
      .not.toContain("db:seed:development");
  });
});
