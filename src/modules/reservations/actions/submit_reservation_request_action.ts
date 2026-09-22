"use server";

import { randomUUID } from "node:crypto";
import { submitReservationRequest } from "../application/submit_reservation_request.server";
import { reservationSubmissionRepository } from "../infrastructure/reservation_submission_repository.server";
import { turnstileSubmissionProtection } from "@/modules/leads/infrastructure/turnstile_submission_protection.server";
import { formatLeadValidationErrors, leadSubmissionSchema, type LeadSubmissionInput } from "@/modules/leads/validation/lead_submission";
import type { ReservationContext, ReservationFormState } from "../components/reservation_form_state";

export async function submitReservationRequestAction(
  context: ReservationContext, _state: ReservationFormState, formData: FormData,
): Promise<ReservationFormState> {
  const fields = ["fullName", "phone", "email", "city", "usagePurpose", "hasDefinitiveLicense", "hasEar",
    "driverPlatform", "preferredContactTime", "eligibilityAcknowledgement", "acknowledgement"];
  const read = (key: string) => typeof formData.get(key) === "string" ? String(formData.get(key)) : "";
  const values = Object.fromEntries(fields.map((key) => [key, read(key)]));
  const input = { ...values, ...context, website: read("website"),
    turnstileToken: read("turnstileToken"), turnstileIdempotencyKey: read("turnstileIdempotencyKey") } as LeadSubmissionInput & ReservationContext;
  const retryValues = { ...values, pickupDate: context.pickupDate, returnDate: context.returnDate };
  try {
    const result = await submitReservationRequest(reservationSubmissionRepository, turnstileSubmissionProtection, input);
    switch (result.status) {
      case "success":
      case "ignored":
        return { status: "success", message: "A locadora analisará sua solicitação e entrará em contato. O envio não é aprovação; o período só será confirmado após aprovação." };
      case "unavailable":
        return { status: "unavailable", values: retryValues, message: "A disponibilidade mudou desde a consulta. Esse veículo não está mais disponível nesse período. Escolha novas datas para continuar." };
      case "conflict":
        return { status: "conflict", values: retryValues, message: "Não foi possível concluir este envio. Para evitar uma solicitação duplicada, entre em contato com a locadora antes de iniciar outra solicitação." };
      case "blocked":
        return { status: "error", values: retryValues, turnstileResetId: randomUUID(), message: "Não foi possível validar a proteção contra abuso. Tente novamente." };
      case "invalid": {
        const parsed = leadSubmissionSchema.safeParse(input);
        const errors = parsed.success ? undefined : formatLeadValidationErrors(parsed.error);
        return { status: "error", values: retryValues, errors, message: "Revise os campos indicados e o período escolhido.",
          ...(errors?.turnstileToken ? { turnstileResetId: randomUUID() } : {}) };
      }
      default:
        return { status: "error", values: retryValues, message: "Não foi possível concluir o envio agora. Tente novamente neste formulário." };
    }
  } catch {
    return { status: "error", values: retryValues, message: "Não foi possível concluir o envio agora. Tente novamente neste formulário." };
  }
}
