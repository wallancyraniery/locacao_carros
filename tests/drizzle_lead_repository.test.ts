import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";
import * as schema from "@/modules/database/schema";
import type { NewLead } from "@/modules/leads/domain/lead_repository";
import { drizzleLeadRepository } from "@/modules/leads/infrastructure/drizzle_lead_repository.server";
import { safeLeadRepositoryDiagnostic } from "@/modules/leads/infrastructure/lead_repository_diagnostic";

const getDatabase = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/modules/database/client.server", () => ({ getDatabase }));

const lead: NewLead = {
  operationId: "40000000-0000-4000-8000-000000000001",
  organizationId: "10000000-0000-4000-8000-000000000001",
  vehicleId: "20000000-0000-4000-8000-000000000003",
  fullName: "Pessoa Sintética ' teste",
  phone: "11999999999",
  email: "sintetico@example.test",
  city: "Cidade Sintética",
  hasDefinitiveLicense: true,
  usagePurpose: "professional_app",
  hasEar: true,
  driverPlatform: "Aplicativo sintético",
  preferredContactTime: null,
};

const lookupRows = vi.fn();
const unsafe = vi.fn<(query: string, params: unknown[]) => unknown>();

describe("repository Drizzle real com transporte local simulado", () => {
  beforeEach(() => {
    lookupRows.mockReset().mockResolvedValue([[lead.vehicleId, lead.organizationId]]);
    unsafe.mockReset().mockImplementation(() => Object.assign(Promise.resolve([]), { values: lookupRows }));
    // This client only captures SQL; it has no socket or connection implementation.
    const client = { options: { parsers: {}, serializers: {} }, unsafe } as unknown as Sql;
    getDatabase.mockReset().mockReturnValue(drizzle(client, { schema }));
  });

  it("insere somente as 14 colunas concedidas e ignora conflito da mesma operação", async () => {
    const result = await drizzleLeadRepository.createLead(lead);

    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(unsafe).toHaveBeenCalledOnce();
    const [query, params] = unsafe.mock.calls[0];
    expect(query.replace(/\s+/g, " ")).toBe(
      'insert into "rental_leads" ( "id", "operation_id", "organization_id", "vehicle_id", "full_name", "phone", "email", "city", '
      + '"has_definitive_license", "usage_purpose", "has_ear", "driver_platform", "preferred_contact_time", "status" '
      + ') values ( $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14 ) on conflict do nothing',
    );
    expect(query).not.toMatch(/created_at|updated_at|returning/i);
    expect(params).toEqual([
      result.id, lead.operationId, lead.organizationId, lead.vehicleId, lead.fullName, lead.phone, lead.email,
      lead.city, lead.hasDefinitiveLicense, lead.usagePurpose, lead.hasEar, lead.driverPlatform,
      lead.preferredContactTime, "new",
    ]);
    for (const value of [lead.fullName, lead.phone, lead.email!, lead.city]) expect(query).not.toContain(value);
  });

  it("consulta somente as colunas de veículo autorizadas e preserva os filtros de disponibilidade", async () => {
    await expect(drizzleLeadRepository.findAvailableDemoVehicle(lead.vehicleId)).resolves.toEqual({
      id: lead.vehicleId, organizationId: lead.organizationId,
    });
    const [query, params] = unsafe.mock.calls[0];
    expect(query).toContain('select "vehicles"."id", "vehicles"."organization_id"');
    expect(query).toContain('inner join "organizations"');
    expect(query).toContain('"vehicles"."status" = $3');
    expect(query).toContain('"vehicles"."is_demo" = $4');
    expect(params).toEqual([lead.vehicleId, lead.organizationId, "available", true, 1]);
  });

  it("retorna null quando nenhum veículo autorizado é visível", async () => {
    lookupRows.mockResolvedValueOnce([]);
    await expect(drizzleLeadRepository.findAvailableDemoVehicle(lead.vehicleId)).resolves.toBeNull();
  });

  it("identifica falha de inicialização sem executar consulta", async () => {
    getDatabase.mockImplementationOnce(() => { throw new Error("configuração privada"); });
    await expect(drizzleLeadRepository.createLead(lead)).rejects.toMatchObject({
      diagnostic: { stage: "runtime_client_initialization", code: null },
    });
    expect(unsafe).not.toHaveBeenCalled();
  });

  it.each(["lookup", "insert"] as const)("preserva código PostgreSQL encapsulado pelo Drizzle na falha de %s", async (operation) => {
    const postgresError = Object.assign(new Error(lead.fullName), { code: "42501", detail: lead.phone });
    if (operation === "lookup") lookupRows.mockRejectedValueOnce(postgresError);
    else unsafe.mockImplementationOnce(() => Promise.reject(postgresError));
    let failure: unknown;
    try {
      if (operation === "lookup") await drizzleLeadRepository.findAvailableDemoVehicle(lead.vehicleId);
      else await drizzleLeadRepository.createLead(lead);
    } catch (error) {
      failure = error;
    }
    expect(safeLeadRepositoryDiagnostic(failure)).toEqual({
      stage: operation === "lookup" ? "find_available_demo_vehicle" : "create_lead", code: "42501",
    });
    expect(JSON.stringify(failure)).not.toContain(lead.fullName);
    expect(JSON.stringify(failure)).not.toContain(lead.phone);
  });
});
