import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { submitLead } from "@/modules/leads/application/submit_lead";
import type { LeadRepository, NewLead } from "@/modules/leads/domain/lead_repository";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";

const organizationId = "10000000-0000-4000-8000-000000000001";
const availableVehicleId = "20000000-0000-4000-8000-000000000001";
const rentedVehicleId = "20000000-0000-4000-8000-000000000003";

describe("captura de interesse no PostgreSQL", () => {
  let sql: ReturnType<typeof postgres>;
  let repository: LeadRepository;
  let seedReady = false;

  beforeAll(() => {
    const { testDatabaseUrl, testDatabaseName } = parseTestDatabaseEnvironment(process.env);
    sql = postgres(testDatabaseUrl, { max: 1 });
    const seedEnvironment = { ...process.env, DATABASE_URL: testDatabaseUrl, POSTGRES_DB: testDatabaseName };
    execFileSync(process.execPath, ["scripts/seed_development.mjs"], { cwd: process.cwd(), env: seedEnvironment, stdio: "ignore" });
    execFileSync(process.execPath, ["scripts/seed_development.mjs"], { cwd: process.cwd(), env: seedEnvironment, stdio: "ignore" });
    seedReady = true;
    repository = {
      async findAvailableDemoVehicle(vehicleId) {
        const [vehicle] = await sql`select id, organization_id from vehicles where id = ${vehicleId} and organization_id = ${organizationId} and status = 'available' and is_demo = true`;
        return vehicle ? { id: vehicle.id, organizationId: vehicle.organization_id, displayName: "Veículo de teste" } : null;
      },
      async createLead(lead: NewLead) {
        const [created] = await sql`insert into rental_leads (organization_id, vehicle_id, full_name, phone, email, city, has_definitive_license, usage_purpose, has_ear, driver_platform, preferred_contact_time, status) values (${lead.organizationId}, ${lead.vehicleId}, ${lead.fullName}, ${lead.phone}, ${lead.email}, ${lead.city}, ${lead.hasDefinitiveLicense}, ${lead.usagePurpose}, ${lead.hasEar}, ${lead.driverPlatform}, ${lead.preferredContactTime}, 'new') returning id`;
        return { id: created.id };
      },
    };
  });
  afterAll(async () => { if (sql) { if (seedReady) await sql`delete from rental_leads where email = 'integration@example.test'`; await sql.end(); } });

  it("mantém organização única e quatro veículos após duas execuções", async () => {
    const [organization] = await sql`select count(*)::int as count from organizations where id = ${organizationId}`;
    const [vehicles] = await sql`select count(*)::int as count from vehicles where organization_id = ${organizationId} and is_demo = true`;
    expect(organization.count).toBe(1);
    expect(vehicles.count).toBe(4);
  });

  it("cria lead válido com status e organização definidos no servidor", async () => {
    const result = await submitLead(repository, { vehicleId: availableVehicleId, fullName: "Pessoa Integração", phone: "(12) 99999-9999", email: "integration@example.test", city: "Cidade de Teste", hasDefinitiveLicense: "yes", usagePurpose: "professional_app", hasEar: "yes", driverPlatform: "", preferredContactTime: "", eligibilityAcknowledgement: "accepted", acknowledgement: "accepted", website: "" });
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const [lead] = await sql`select organization_id, vehicle_id, usage_purpose, has_ear, status from rental_leads where id = ${result.leadId}`;
    expect(lead).toEqual({ organization_id: organizationId, vehicle_id: availableVehicleId, usage_purpose: "professional_app", has_ear: true, status: "new" });
  });

  it.each(["30000000-0000-4000-8000-000000000099", rentedVehicleId])("rejeita veículo inexistente ou indisponível", async (vehicleId) => {
    const result = await submitLead(repository, { vehicleId, fullName: "Pessoa Integração", phone: "(12) 99999-9999", email: "integration@example.test", city: "Cidade de Teste", hasDefinitiveLicense: "yes", usagePurpose: "other", hasEar: "not_applicable", driverPlatform: "", preferredContactTime: "", eligibilityAcknowledgement: "accepted", acknowledgement: "accepted", website: "" });
    expect(result.status).toBe("unavailable");
  });

  it("não adiciona colunas para documentos ou dados financeiros", async () => {
    const columns = await sql`select column_name from information_schema.columns where table_name = 'rental_leads'`;
    const names = columns.map(({ column_name }) => column_name);
    expect(names).not.toEqual(expect.arrayContaining(["cpf", "rg", "cnh_number", "cnh_image", "proof_of_address", "criminal_records", "card_number", "bank_account"]));
  });
});
