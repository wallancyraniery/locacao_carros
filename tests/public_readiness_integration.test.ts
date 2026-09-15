import { Buffer } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const drizzleRepository = vi.hoisted(() => ({
  findAvailableDemoVehicle: vi.fn(),
  createLead: vi.fn(),
}));
vi.mock("@/modules/leads/infrastructure/drizzle_lead_repository.server", () => ({
  drizzleLeadRepository: drizzleRepository,
}));


const projectRef = "abcdefghijklmnopqrst";
const syntheticPem = [
  "-----BEGIN CERTIFICATE-----",
  "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo1MjM0NTY3ODkwQUJDREVGR0hJSktM",
  "MA==",
  "-----END CERTIFICATE-----",
].join("\n");

const productionEnvironmentWithoutPrivacy = {
  NODE_ENV: "production",
  DATABASE_RUNTIME_PROVIDER: "supabase",
  SUPABASE_RUNTIME_PROJECT_REF: projectRef,
  SUPABASE_RUNTIME_DATABASE_URL: `postgresql://lead_intake_runtime.${projectRef}:runtime_password_test@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=verify-full`,
  SUPABASE_RUNTIME_SSL_CA_BASE64: Buffer.from(syntheticPem, "utf8").toString("base64"),
  SUPABASE_RUNTIME_CONFIRMATION: `locacao_carros:${projectRef}:lead_intake_runtime`,
  TURNSTILE_MODE: "cloudflare",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site-key-sintetica",
  TURNSTILE_SECRET_KEY: "turnstile-secret-sintetico",
  TURNSTILE_EXPECTED_HOSTNAME: "locadora.example.test",
};

function validFormData() {
  const formData = new FormData();
  for (const [field, value] of Object.entries({
    operationId: "40000000-0000-4000-8000-000000000001",
    turnstileIdempotencyKey: "50000000-0000-4000-8000-000000000001",
    turnstileToken: "token-sintetico",
    vehicleId: "20000000-0000-4000-8000-000000000003",
    fullName: "Pessoa Sintética",
    phone: "(12) 99999-9999",
    email: "pessoa@example.test",
    city: "Cidade Sintética",
    hasDefinitiveLicense: "yes",
    usagePurpose: "professional_app",
    hasEar: "yes",
    driverPlatform: "Aplicativo sintético",
    preferredContactTime: "Tarde",
    eligibilityAcknowledgement: "accepted",
    acknowledgement: "accepted",
    website: "",
  })) formData.set(field, value);
  return formData;
}

describe("integração local dos gates públicos", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("WHATSAPP_BUSINESS_NUMBER", "5511999990000");
    for (const field of [
      "DATABASE_URL", "MIGRATION_DATABASE_URL", "TEST_DATABASE_URL", "POSTGRES_PASSWORD",
      "SUPABASE_MIGRATION_DATABASE_URL", "SUPABASE_SECRET_KEY",
      "PRIVACY_CONTROLLER_NAME", "PRIVACY_CONTACT_LABEL", "PRIVACY_CONTACT_URL",
    ]) vi.stubEnv(field, undefined);
    for (const [field, value] of Object.entries(productionEnvironmentWithoutPrivacy)) {
      vi.stubEnv(field, value);
    }
    drizzleRepository.findAvailableDemoVehicle.mockReset();
    drizzleRepository.createLead.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("oferece WhatsApp após persistência com o contrato completo de produção", async () => {
    vi.stubEnv("PRIVACY_CONTROLLER_NAME", "Locadora oficial sintética");
    vi.stubEnv("PRIVACY_CONTACT_LABEL", "Canal oficial de privacidade");
    vi.stubEnv("PRIVACY_CONTACT_URL", "mailto:privacidade@locadora.com.br");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, hostname: "locadora.example.test", action: "submit_lead" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    drizzleRepository.findAvailableDemoVehicle.mockResolvedValue({
      id: "20000000-0000-4000-8000-000000000003",
      organizationId: "10000000-0000-4000-8000-000000000001",
    });
    drizzleRepository.createLead.mockResolvedValue({ id: "30000000-0000-4000-8000-000000000001" });
    const { submitLeadAction } = await import("@/modules/leads/actions/submit_lead_action");

    const result = await submitLeadAction({ status: "idle" }, validFormData());

    expect(result.status).toBe("success");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(drizzleRepository.createLead).toHaveBeenCalledOnce();
    const url = new URL(result.whatsappUrl!);
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/5511999990000");
    expect([...url.searchParams]).toEqual([["text", "Olá! Gostaria de conversar sobre locação de um veículo."]]);
  });

  it("recusa submissão direta sem privacidade oficial antes de rede ou banco", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { submitLeadAction } = await import("@/modules/leads/actions/submit_lead_action");
    const result = await submitLeadAction({ status: "success", whatsappUrl: "https://wa.me/5511999990000" }, validFormData());

    expect(result).not.toHaveProperty("whatsappUrl");

    expect(result).toMatchObject({
      status: "error",
      message: "Não foi possível enviar seu interesse agora. Tente novamente mais tarde.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(drizzleRepository.findAvailableDemoVehicle).not.toHaveBeenCalled();
    expect(drizzleRepository.createLead).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledExactlyOnceWith({
      stage: "verify_turnstile",
      code: "INVALID_PRIVACY_NOTICE_ENVIRONMENT",
    });
    const diagnostic = JSON.stringify(consoleError.mock.calls);
    for (const privateValue of [
      "Pessoa Sintética",
      "(12) 99999-9999",
      "pessoa@example.test",
      "Cidade Sintética",
      "runtime_password_test",
      "turnstile-secret-sintetico",
      productionEnvironmentWithoutPrivacy.SUPABASE_RUNTIME_DATABASE_URL,
      productionEnvironmentWithoutPrivacy.SUPABASE_RUNTIME_SSL_CA_BASE64,
    ]) expect(diagnostic).not.toContain(privateValue);
    consoleError.mockRestore();
  });
});
