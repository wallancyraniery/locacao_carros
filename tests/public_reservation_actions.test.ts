import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkAvailabilityAction } from "@/modules/vehicles/actions/check_availability_action";
import { submitReservationRequestAction } from "@/modules/reservations/actions/submit_reservation_request_action";
import { availabilityQuerySchema } from "@/modules/vehicles/domain/availability_period";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ available: vi.fn(), submit: vi.fn(), verify: vi.fn() }));
vi.mock("@/modules/vehicles/infrastructure/availability_repository.server", () => ({ availabilityRepository: { isAvailable: mocks.available } }));
vi.mock("@/modules/reservations/infrastructure/reservation_submission_repository.server", () => ({ reservationSubmissionRepository: { submit: mocks.submit } }));
vi.mock("@/modules/leads/infrastructure/turnstile_submission_protection.server", () => ({ turnstileSubmissionProtection: { verify: mocks.verify } }));
const context = { vehicleId: "20000000-0000-4000-8000-000000000001", operationId: "40000000-0000-4000-8000-000000000001", pickupDate: "2028-02-29", returnDate: "2028-03-05" };
const values = { fullName: "Pessoa Sintética", phone: "11999999999", email: "test@example.test", city: "Cidade",
  hasDefinitiveLicense: "yes", hasEar: "not_applicable", usagePurpose: "other", driverPlatform: "", preferredContactTime: "",
  eligibilityAcknowledgement: "accepted", acknowledgement: "accepted", website: "", turnstileToken: "synthetic-token",
  turnstileIdempotencyKey: "50000000-0000-4000-8000-000000000001" };
function form(data: Record<string, string>) { const result = new FormData(); for (const [key, value] of Object.entries(data)) result.set(key, value); return result; }
beforeEach(() => { vi.clearAllMocks(); mocks.available.mockResolvedValue(true); mocks.verify.mockResolvedValue(true); mocks.submit.mockResolvedValue({ status: "success", leadId: "private-id", reservationRequestId: "private-request", requestStatus: "requested" }); });

describe("consulta pública sem escrita", () => {
  it.each([true, false])("disponibilidade %s é mapeada sem persistir", async (available) => {
    mocks.available.mockResolvedValueOnce(available);
    const result = await checkAvailabilityAction(context.vehicleId, { status: "idle" }, form(context));
    expect(result.status).toBe(available ? "available" : "unavailable");
    expect(mocks.available).toHaveBeenCalledWith({ vehicleId: context.vehicleId, pickupDate: context.pickupDate, returnDate: context.returnDate });
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it.each(["2028-02-30", "0000-01-01", "1900-02-29", "2028-03-05", "2028-03-06", "2028-02-29T00:00:00Z"])("rejeita retirada inválida %s", async (pickupDate) => {
    expect((await checkAvailabilityAction(context.vehicleId, { status: "idle" }, form({ ...context, pickupDate }))).status).toBe("invalid");
    expect(mocks.available).not.toHaveBeenCalled();
  });
  it("falha fechada sem expor detalhes da infraestrutura", async () => {
    mocks.available.mockRejectedValueOnce(new Error("secret SQL password"));
    const result = await checkAvailabilityAction(context.vehicleId, { status: "idle" }, form(context));
    expect(result).toEqual({ status: "error", pickupDate: context.pickupDate, returnDate: context.returnDate,
      message: "Não foi possível confirmar a disponibilidade agora. Tente novamente em instantes." });
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/SQL|password/);
  });
  it("valida datas civis sem conversão de timezone", () => {
    expect(availabilityQuerySchema.safeParse({ ...context, pickupDate: "2000-02-29" }).success).toBe(true);
    expect(availabilityQuerySchema.safeParse({ ...context, pickupDate: "2100-02-29", returnDate: "2100-03-01" }).success).toBe(false);
  });
});

describe("action de solicitação com caso de uso real", () => {
  it("envia contexto do servidor e mantém operação e período nos retries", async () => {
    const data = form({ ...values, operationId: crypto.randomUUID(), vehicleId: crypto.randomUUID(), pickupDate: "2099-01-01" });
    const first = await submitReservationRequestAction(context, { status: "idle" }, data);
    const second = await submitReservationRequestAction(context, { status: "error" }, data);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ status: "success" });
    expect(first).not.toHaveProperty("leadId");
    expect(first).not.toHaveProperty("reservationRequestId");
    for (const [submitted] of mocks.submit.mock.calls) expect(submitted).toMatchObject(context);
    expect(mocks.verify).toHaveBeenCalledWith({ token: values.turnstileToken, operationId: context.operationId, idempotencyKey: values.turnstileIdempotencyKey });
    expect(first.message).toContain("O envio não é aprovação");
  });
  it.each(["unavailable", "conflict", "error"])("mapeia %s e preserva campos e datas", async (status) => {
    mocks.submit.mockResolvedValueOnce({ status, secret: "SQL password" });
    const result = await submitReservationRequestAction(context, { status: "idle" }, form(values));
    expect(result.status).toBe(status);
    expect(result.values).toMatchObject({ fullName: values.fullName, pickupDate: context.pickupDate, returnDate: context.returnDate });
    expect(result.values).not.toHaveProperty("turnstileToken");
    expect(result.values).not.toHaveProperty("operationId");
    expect(result.message).not.toMatch(/SQL|password|lead|operationId/);
  });
  it("proteção rejeitada permite nova verificação sem substituir a operação", async () => {
    mocks.verify.mockResolvedValueOnce(false);
    const result = await submitReservationRequestAction(context, { status: "idle" }, form(values));
    expect(result).toMatchObject({ status: "error", turnstileResetId: expect.any(String) });
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("operationId");
  });
  it("apresenta validação de campos compartilhada", async () => {
    const result = await submitReservationRequestAction(context, { status: "idle" }, form({ ...values, fullName: "" }));
    expect(result.errors?.fullName).toBeDefined();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("erro inesperado não vaza SQL, PII ou configuração", async () => {
    mocks.submit.mockRejectedValueOnce(new Error("SQL private config"));
    const result = await submitReservationRequestAction(context, { status: "idle" }, form(values));
    expect(result.status).toBe("error");
    expect(result.message).not.toMatch(/SQL|private|config/);
    expect(result.values?.fullName).toBe(values.fullName);
  });
});
