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

const validInput = {
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
  });

  it("valida, normaliza e envia dados válidos", async () => {
    const adapter = repository();
    expect(await submitLead(adapter, validInput)).toMatchObject({ status: "success" });
    expect(adapter.createLead).toHaveBeenCalledWith(expect.objectContaining({
      fullName: "Pessoa de Teste",
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
    const result = await submitLead(repository(), { ...validInput, ...changes } as never);
    expect(result).toMatchObject({ status: "invalid", errors: { [field]: [message] } });
  });

  it("limita entradas excessivas", async () => {
    const result = await submitLead(repository(), { ...validInput, fullName: "a".repeat(121) });
    expect(result).toMatchObject({ status: "invalid", errors: { fullName: ["Nome completo deve ter no máximo 120 caracteres."] } });
  });

  it("ignora honeypot preenchido sem consultar ou persistir", async () => {
    const adapter = repository();
    expect(await submitLead(adapter, { ...validInput, website: "bot" })).toEqual({ status: "ignored" });
    expect(adapter.findAvailableDemoVehicle).not.toHaveBeenCalled();
    expect(adapter.createLead).not.toHaveBeenCalled();
  });

  it("exige declaração de EAR aplicável ao uso profissional", async () => {
    expect(await submitLead(repository(), { ...validInput, hasEar: "not_applicable" })).toMatchObject({
      status: "invalid",
      errors: { hasEar: ["Informe se sua CNH possui EAR para atividade remunerada por aplicativo."] },
    });
    expect(await submitLead(repository(), { ...validInput, usagePurpose: "other", hasEar: "not_applicable" })).toMatchObject({ status: "success" });
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
    expect(consoleError).toHaveBeenCalledWith({ stage, code });
    const diagnostic = JSON.stringify(consoleError.mock.calls);
    for (const privateValue of privateValues) expect(diagnostic).not.toContain(privateValue);
    consoleError.mockRestore();
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
    expect(await submitLead(adapter, validInput)).toMatchObject({ status: "unavailable", errors: { vehicleId: ["O veículo selecionado não está disponível."] } });
  });
});
