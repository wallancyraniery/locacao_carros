import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
import * as application from "@/modules/reservations/application/submit_reservation_request.server";
import { submitReservationRequestAction } from "@/modules/reservations/actions/submit_reservation_request_action";
import { LeadRepositoryDiagnosticError } from "@/modules/leads/infrastructure/lead_repository_diagnostic";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ execute: vi.fn(), verify: vi.fn() }));
vi.mock("@/modules/database/client.server", () => ({ getDatabase: () => ({ execute: mocks.execute }) }));
vi.mock("@/modules/leads/infrastructure/turnstile_submission_protection.server", () => ({ turnstileSubmissionProtection: { verify: mocks.verify } }));
const context = {
  operationId: "40000000-0000-4000-8000-000000000001", vehicleId: "20000000-0000-4000-8000-000000000001",
  pickupDate: "2028-02-28", returnDate: "2028-03-01",
};
const values = {
  fullName: "Pessoa Sintética", phone: "11999999999", email: "test@example.test", city: "Cidade Sintética",
  hasDefinitiveLicense: "yes" as const, usagePurpose: "other" as const, hasEar: "not_applicable" as const,
  eligibilityAcknowledgement: "accepted" as const, acknowledgement: "accepted" as const,
  turnstileToken: "synthetic-private-token", turnstileIdempotencyKey: "50000000-0000-4000-8000-000000000001",
  driverPlatform: "", preferredContactTime: "", website: "",
};
const receipt = { lead_id: crypto.randomUUID(), reservation_request_id: crypto.randomUUID(), status: "requested" };
const publicMessage = "Não foi possível concluir o envio agora. Tente novamente neste formulário.";
function submit() {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return submitReservationRequestAction(context, { status: "idle" }, data);
}
function privateError(code: string) {
  return new DrizzleQueryError("SELECT * FROM reservation_submission_private.submit($1)", Object.values(values),
    Object.assign(new Error("mensagem privada " + values.email), { code, detail: values.phone, token: values.turnstileToken }));
}
function expectDiagnostic(stage: string, code: string | null) {
  expect(console.error).toHaveBeenCalledExactlyOnceWith({ stage, code });
  const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
  for (const value of [values.fullName, values.email, values.phone, values.city, values.turnstileToken,
    values.turnstileIdempotencyKey, context.operationId, "SELECT", "query", "stack", "FormData", "mensagem privada"]) {
    expect(logged).not.toContain(value);
  }
}
beforeEach(() => {
  mocks.execute.mockReset().mockResolvedValue([receipt]);
  mocks.verify.mockReset().mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

it.each(["42501", "ECONNREFUSED", "INVALID_RUNTIME_DATABASE_ENVIRONMENT", "email@example.test", "MARIA"])(
  "falha do banco %s produz apenas diagnóstico permitido e mensagem pública genérica", async (code) => {
    mocks.execute.mockRejectedValueOnce(privateError(code));
    const result = await submit();
    expect(result.status).toBe("error");
    expect(result.message).toBe(publicMessage);
    expect(result).not.toHaveProperty("code");
    expect(result).not.toHaveProperty("stage");
    expect(result).not.toHaveProperty("diagnostic");
    expect(result.values).not.toHaveProperty("turnstileToken");
    expectDiagnostic("reservation_submission", ["email@example.test", "MARIA"].includes(code) ? null : code);
  },
);

it("recibo inválido é diagnosticado sem registrar a resposta do banco", async () => {
  mocks.execute.mockResolvedValueOnce([{ ...values, status: "approved" }]);
  expect(await submit()).toMatchObject({ status: "error", message: publicMessage });
  expectDiagnostic("reservation_submission", null);
});

it.each([false, true])("falha Turnstile com wrapper=%s preserva estágio e código", async (wrapped) => {
  const error = wrapped
    ? new LeadRepositoryDiagnosticError({ stage: "verify_turnstile", code: "TURNSTILE_UNAVAILABLE" })
    : Object.assign(new Error(values.turnstileToken), { code: "ETIMEDOUT" });
  mocks.verify.mockRejectedValueOnce(error);
  expect(await submit()).toMatchObject({ status: "error", message: publicMessage });
  expectDiagnostic("reservation_turnstile", wrapped ? "TURNSTILE_UNAVAILABLE" : "ETIMEDOUT");
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("código privado no wrapper Turnstile também é sanitizado", async () => {
  mocks.verify.mockRejectedValueOnce(new LeadRepositoryDiagnosticError({ stage: "verify_turnstile", code: values.email }));
  expect(await submit()).toMatchObject({ status: "error", message: publicMessage });
  expectDiagnostic("reservation_turnstile", null);
});

it("exceção de outro repository é diagnosticada pelo caso de uso", async () => {
  const repository = { submit: vi.fn().mockRejectedValueOnce(privateError("42501")) };
  expect(await application.submitReservationRequest(repository, { verify: mocks.verify }, { ...values, ...context }))
    .toEqual({ status: "error" });
  expectDiagnostic("reservation_submission", "42501");
});

it("captura final da action sanitiza exceções inesperadas do caso de uso", async () => {
  vi.spyOn(application, "submitReservationRequest").mockRejectedValueOnce(privateError("08006"));
  expect(await submit()).toMatchObject({ status: "error", message: publicMessage });
  expectDiagnostic("reservation_submission", "08006");
});

it.each([["P1001", "error"], ["P1002", "unavailable"], ["P1003", "conflict"]])(
  "resultado de domínio %s não é registrado como falha técnica", async (code, status) => {
    mocks.execute.mockRejectedValueOnce(privateError(code));
    expect((await submit()).status).toBe(status);
    expect(console.error).not.toHaveBeenCalled();
  },
);

it("sucesso e rejeição da proteção não geram diagnóstico técnico", async () => {
  expect((await submit()).status).toBe("success");
  mocks.verify.mockResolvedValueOnce(false);
  expect((await submit()).status).toBe("error");
  expect(console.error).not.toHaveBeenCalled();
});
