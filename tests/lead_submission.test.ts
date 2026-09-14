import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitLead } from "@/modules/leads/application/submit_lead";
import { submitLeadAction } from "@/modules/leads/actions/submit_lead_action";
import type { LeadRepository } from "@/modules/leads/domain/lead_repository";
import { LeadRepositoryDiagnosticError } from "@/modules/leads/infrastructure/lead_repository_diagnostic";

const drizzleRepository = vi.hoisted(() => ({
  findAvailableDemoVehicle: vi.fn(),
  createLead: vi.fn(),
}));
vi.mock("@/modules/leads/infrastructure/drizzle_lead_repository.server", () => ({ drizzleLeadRepository: drizzleRepository }));
const turnstileProtection = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/modules/leads/infrastructure/turnstile_submission_protection.server", () => ({ turnstileSubmissionProtection: turnstileProtection }));

const validInput = {
  operationId: "40000000-0000-4000-8000-000000000001",
  turnstileIdempotencyKey: "50000000-0000-4000-8000-000000000001",
  turnstileToken: "synthetic-token",
  vehicleId: "20000000-0000-4000-8000-000000000001",
  fullName: "  Pessoa de Teste  ",
  phone: "(12) 99999-9999",
  email: "pessoa@example.test",
  city: "São José dos Campos",
  hasDefinitiveLicense: "yes" as const,
  usagePurpose: "professional_app" as const,
  hasEar: "yes" as const,
  driverPlatform: "Aplicativo local",
  preferredContactTime: "Tarde",
  eligibilityAcknowledgement: "accepted" as const,
  acknowledgement: "accepted" as const,
  website: "",
};

const protection = () => ({ verify: vi.fn().mockResolvedValue(true) });

function repository(): LeadRepository {
  return {
    findAvailableDemoVehicle: vi.fn().mockResolvedValue({ id: validInput.vehicleId, organizationId: "10000000-0000-4000-8000-000000000001" }),
    createLead: vi.fn().mockResolvedValue({ id: "30000000-0000-4000-8000-000000000001" }),
  };
}

function formDataFromValidInput() {
  const formData = new FormData();
  Object.entries(validInput).forEach(([field, value]) => formData.set(field, value));
  return formData;
}

describe("envio de interesse", () => {
  beforeEach(() => {
    drizzleRepository.findAvailableDemoVehicle.mockReset().mockResolvedValue({
      id: validInput.vehicleId,
      organizationId: "10000000-0000-4000-8000-000000000001",
    });
    drizzleRepository.createLead.mockReset().mockResolvedValue({ id: "30000000-0000-4000-8000-000000000001" });
    turnstileProtection.verify.mockReset().mockResolvedValue(true);
  });

  it("valida, normaliza e envia dados válidos", async () => {
    const adapter = repository();
    expect(await submitLead(adapter, protection(), validInput)).toMatchObject({ status: "success" });
    expect(adapter.createLead).toHaveBeenCalledWith(expect.objectContaining({
      fullName: "Pessoa de Teste",
      operationId: validInput.operationId,
      hasDefinitiveLicense: true,
      usagePurpose: "professional_app",
      hasEar: true,
    }));
  });

  it.each([
    ["nome ausente", { fullName: "" }, "fullName", "Nome completo é obrigatório."],
    ["telefone inválido", { phone: "123" }, "phone", "Informe um telefone brasileiro válido."],
    ["e-mail inválido", { email: "email-inválido" }, "email", "Informe um e-mail válido."],
    ["CNH não respondida", { hasDefinitiveLicense: undefined }, "hasDefinitiveLicense", "Informe se possui CNH definitiva."],
    ["finalidade ausente", { usagePurpose: undefined }, "usagePurpose", "Informe a finalidade de uso do veículo."],
    ["EAR ausente", { hasEar: undefined }, "hasEar", "Informe sua situação em relação à EAR."],
  ])("rejeita %s com mensagem em português", async (_name, changes, field, message) => {
    const result = await submitLead(repository(), protection(), { ...validInput, ...changes } as never);
    expect(result).toMatchObject({ status: "invalid", errors: { [field]: [message] } });
  });

  it("limita entradas excessivas", async () => {
    const result = await submitLead(repository(), protection(), { ...validInput, fullName: "a".repeat(121) });
    expect(result).toMatchObject({ status: "invalid", errors: { fullName: ["Nome completo deve ter no máximo 120 caracteres."] } });
  });

  it("ignora honeypot preenchido sem consultar ou persistir", async () => {
    const adapter = repository();
    const verifier = protection();
    expect(await submitLead(adapter, verifier, { ...validInput, website: "bot" })).toEqual({ status: "ignored" });
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(adapter.findAvailableDemoVehicle).not.toHaveBeenCalled();
    expect(adapter.createLead).not.toHaveBeenCalled();
  });

  it("exige declaração de EAR aplicável ao uso profissional", async () => {
    expect(await submitLead(repository(), protection(), { ...validInput, hasEar: "not_applicable" })).toMatchObject({
      status: "invalid",
      errors: { hasEar: ["Informe se sua CNH possui EAR para atividade remunerada por aplicativo."] },
    });
    expect(await submitLead(repository(), protection(), { ...validInput, usagePurpose: "other", hasEar: "not_applicable" })).toMatchObject({ status: "success" });
  });

  it("preserva os campos informados quando a Server Action recebe entrada inválida", async () => {
    const formData = new FormData();
    Object.entries({ ...validInput, fullName: "" }).forEach(([field, value]) => formData.set(field, value));
    const result = await submitLeadAction({ status: "idle" }, formData);
    expect(result).toMatchObject({
      status: "error",
      values: expect.objectContaining({ usagePurpose: "professional_app", hasEar: "yes", phone: validInput.phone }),
    });
  });

  it.each([
    ["find_available_demo_vehicle", "08006", "lookup"],
    ["create_lead", "42501", "insert"],
  ] as const)("registra somente estágio e código seguros em falha de %s", async (stage, code, operation) => {
    const privateValues = [
      validInput.fullName,
      validInput.fullName.trim(),
      validInput.phone,
      validInput.email,
      validInput.city,
      validInput.driverPlatform,
      validInput.preferredContactTime,
    ];
    const failure = new LeadRepositoryDiagnosticError({ stage, code });
    if (operation === "lookup") drizzleRepository.findAvailableDemoVehicle.mockRejectedValueOnce(failure);
    else drizzleRepository.createLead.mockRejectedValueOnce(failure);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await submitLeadAction({ status: "idle" }, formDataFromValidInput());

    expect(result).toMatchObject({
      status: "error",
      message: "Não foi possível enviar seu interesse agora. Tente novamente mais tarde.",
    });
    expect(result).not.toHaveProperty("operationId");
    expect(result).not.toHaveProperty("turnstileResetId");
    expect(consoleError).toHaveBeenCalledWith({ stage, code });
    const diagnostic = JSON.stringify(consoleError.mock.calls);
    for (const privateValue of privateValues) expect(diagnostic).not.toContain(privateValue);
    consoleError.mockRestore();
  });

  it("mantém falha do Turnstile genérica e diagnóstico sem token ou dados pessoais", async () => {
    turnstileProtection.verify.mockRejectedValueOnce(new LeadRepositoryDiagnosticError({
      stage: "verify_turnstile", code: "TURNSTILE_UNAVAILABLE",
    }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(submitLeadAction({ status: "idle" }, formDataFromValidInput())).resolves.toMatchObject({
      status: "error",
      message: "Não foi possível enviar seu interesse agora. Tente novamente mais tarde.",
    });
    expect(consoleError).toHaveBeenCalledWith({ stage: "verify_turnstile", code: "TURNSTILE_UNAVAILABLE" });
    const diagnostic = JSON.stringify(consoleError.mock.calls);
    for (const privateValue of [validInput.turnstileToken, validInput.fullName, validInput.phone, validInput.email]) {
      expect(diagnostic).not.toContain(privateValue);
    }
    expect(drizzleRepository.findAvailableDemoVehicle).not.toHaveBeenCalled();
    expect(drizzleRepository.createLead).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("preserva a operação e solicita novo token quando o Siteverify rejeita definitivamente", async () => {
    turnstileProtection.verify.mockResolvedValueOnce(false);
    const result = await submitLeadAction({ status: "idle" }, formDataFromValidInput());
    expect(result).toMatchObject({
      status: "error",
      message: "Não foi possível validar a proteção contra abuso. Tente novamente.",
    });
    expect(result).not.toHaveProperty("operationId");
    expect(result.turnstileResetId).toMatch(/^[0-9a-f-]{36}$/);
    expect(drizzleRepository.findAvailableDemoVehicle).not.toHaveBeenCalled();
    expect(drizzleRepository.createLead).not.toHaveBeenCalled();
  });

  it("preserva o fluxo de sucesso da Server Action sem diagnóstico de erro", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(submitLeadAction({ status: "idle" }, formDataFromValidInput())).resolves.toEqual({
      status: "success",
      message: "Interesse enviado com sucesso. A locadora analisará seus dados e entrará em contato.",
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("traduz veículo indisponível sem revelar detalhes internos", async () => {
    const adapter = repository();
    vi.mocked(adapter.findAvailableDemoVehicle).mockResolvedValue(null);
    expect(await submitLead(adapter, protection(), validInput)).toMatchObject({ status: "unavailable", errors: { vehicleId: ["O veículo selecionado não está disponível."] } });
  });

  it("recusa token inválido antes de consultar ou persistir", async () => {
    const adapter = repository();
    const verifier = { verify: vi.fn().mockResolvedValue(false) };
    await expect(submitLead(adapter, verifier, validInput)).resolves.toMatchObject({ status: "blocked" });
    expect(verifier.verify).toHaveBeenCalledWith({
      token: validInput.turnstileToken,
      operationId: validInput.operationId,
      idempotencyKey: validInput.turnstileIdempotencyKey,
    });
    expect(adapter.findAvailableDemoVehicle).not.toHaveBeenCalled();
    expect(adapter.createLead).not.toHaveBeenCalled();
  });

  it.each([
    { turnstileToken: "" },
    { operationId: "invalida" },
    { turnstileIdempotencyKey: "invalida" },
  ])("recusa contrato de proteção ausente ou inválido", async (change) => {
    const adapter = repository();
    const verifier = protection();
    await expect(submitLead(adapter, verifier, { ...validInput, ...change })).resolves.toMatchObject({ status: "invalid" });
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(adapter.createLead).not.toHaveBeenCalled();
  });

  it("traduz token ausente em mensagem pública segura", async () => {
    const formData = formDataFromValidInput();
    formData.delete("turnstileToken");
    const result = await submitLeadAction({ status: "idle" }, formData);
    expect(result).toMatchObject({
      status: "error",
      message: "Não foi possível validar a proteção contra abuso. Tente novamente.",
      values: expect.not.objectContaining({ turnstileToken: expect.anything() }),
    });
    expect(result).not.toHaveProperty("operationId");
    expect(result.turnstileResetId).toMatch(/^[0-9a-f-]{36}$/);
    expect(turnstileProtection.verify).not.toHaveBeenCalled();
    expect(drizzleRepository.createLead).not.toHaveBeenCalled();
  });
});
