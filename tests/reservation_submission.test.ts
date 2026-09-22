import { describe, expect, it, vi } from "vitest";
import { submitReservationRequest } from "@/modules/reservations/application/submit_reservation_request.server";
import { reservationSubmissionRepository } from "@/modules/reservations/infrastructure/reservation_submission_repository.server";

vi.mock("server-only", () => ({}));
const execute = vi.hoisted(() => vi.fn());
vi.mock("@/modules/database/client.server", () => ({ getDatabase: () => ({ execute }) }));
const input = {
  operationId: "40000000-0000-4000-8000-000000000001",
  vehicleId: "20000000-0000-4000-8000-000000000001",
  turnstileIdempotencyKey: "50000000-0000-4000-8000-000000000001", turnstileToken: "synthetic",
  fullName: "Pessoa Sintética", phone: "(12) 99999-9999", email: "test@example.test", city: "Cidade",
  hasDefinitiveLicense: "yes" as const, usagePurpose: "other" as const, hasEar: "not_applicable" as const,
  driverPlatform: "", preferredContactTime: "", eligibilityAcknowledgement: "accepted" as const,
  acknowledgement: "accepted" as const, website: "", pickupDate: "2028-02-28", returnDate: "2028-03-01",
};
const receipt = { lead_id: crypto.randomUUID(), reservation_request_id: crypto.randomUUID(), status: "requested" };
const protection = { verify: vi.fn().mockResolvedValue(true) };

it("valida datas e normaliza o lead; envia uma única operação atômica", async () => {
  execute.mockResolvedValueOnce([receipt]);
  expect(await submitReservationRequest(reservationSubmissionRepository, protection, input)).toEqual({
    status: "success", leadId: receipt.lead_id, reservationRequestId: receipt.reservation_request_id, requestStatus: "requested",
  });
});

it.each([
  ["0000-01-01", "2027-03-01"], ["2027-02-29", "2027-03-01"], ["2028-03-01", "2028-03-01"], ["2028-03-02", "2028-03-01"],
  ["infinity", "2028-03-01"], ["2028-2-01", "2028-03-01"], ["2028-02-30", "2028-03-01"],
])("rejeita período %s / %s antes de persistir", async (pickupDate, returnDate) => {
  const repo = { submit: vi.fn() };
  expect(await submitReservationRequest(repo, protection, { ...input, pickupDate, returnDate })).toEqual({ status: "invalid" });
  expect(repo.submit).not.toHaveBeenCalled();
});

it("recusa proteção inválida e ignora honeypot", async () => {
  const repo = { submit: vi.fn() };
  expect(await submitReservationRequest(repo, { verify: async () => false }, input)).toEqual({ status: "blocked" });
  expect(await submitReservationRequest(repo, protection, { ...input, website: "bot" })).toEqual({ status: "ignored" });
  expect(repo.submit).not.toHaveBeenCalled();
});

it("retry retorna os mesmos identificadores persistidos", async () => {
  execute.mockResolvedValue([receipt]);
  const first = await submitReservationRequest(reservationSubmissionRepository, protection, input);
  expect(await submitReservationRequest(reservationSubmissionRepository, protection, input)).toEqual(first);
});

it.each([["P1002", "unavailable"], ["P1003", "conflict"], ["P1001", "invalid"], ["23514", "error"]])(
  "traduz SQLSTATE %s sem dados internos", async (code, status) => {
    execute.mockRejectedValueOnce({ cause: { code, message: "private data" } });
    expect(await submitReservationRequest(reservationSubmissionRepository, protection, { ...input, returnDate: "2028-03-02" })).toEqual({ status });
  },
);

describe("fail-closed", () => {
  it.each([[], [{}], [receipt, receipt], [{ ...receipt, status: "approved" }]].map((rows) => ({ rows })))("recusa recibo malformado $rows", async ({ rows }) => {
    execute.mockResolvedValueOnce(rows);
    expect(await submitReservationRequest(reservationSubmissionRepository, protection, input)).toEqual({ status: "error" });
  });
  it("não declara sucesso com exceção do repository ou da proteção", async () => {
    const repo = { submit: vi.fn().mockRejectedValue(new Error("private data")) };
    expect(await submitReservationRequest(repo, protection, input)).toEqual({ status: "error" });
    expect(await submitReservationRequest(repo, { verify: async () => { throw new Error("secret token"); } }, input)).toEqual({ status: "error" });
  });
});
