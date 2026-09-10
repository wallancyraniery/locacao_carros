"use server";

import { randomUUID } from "node:crypto";
import { submitLead, type SubmitLeadResult } from "../application/submit_lead";
import type { LeadFormState } from "../components/lead_form_state";
import { drizzleLeadRepository } from "../infrastructure/drizzle_lead_repository.server";
import { reportUnexpectedLeadSubmissionError } from "../infrastructure/lead_repository_diagnostic";
import { turnstileSubmissionProtection } from "../infrastructure/turnstile_submission_protection.server";
import type { LeadSubmissionInput } from "../validation/lead_submission";

export async function submitLeadAction(_state: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const values = Object.fromEntries([...formData.entries()].map(([key, value]) => [key, typeof value === "string" ? value : ""]));
  const formValues = Object.fromEntries(Object.entries(values).filter(([key]) => ![
    "operationId", "turnstileIdempotencyKey", "turnstileToken", "website", "vehicleId",
  ].includes(key)));
  let result: SubmitLeadResult;
  try {
    result = await submitLead(drizzleLeadRepository, turnstileSubmissionProtection, values as LeadSubmissionInput);
  } catch (error) {
    reportUnexpectedLeadSubmissionError(error);
    return { status: "error", message: "Não foi possível enviar seu interesse agora. Tente novamente mais tarde.", values: formValues };
  }
  if (result.status === "success" || result.status === "ignored") {
    return { status: "success", message: "Interesse enviado com sucesso. A locadora analisará seus dados e entrará em contato." };
  }
  if (result.status === "blocked" || result.errors.turnstileToken) {
    return {
      status: "error",
      message: "Não foi possível validar a proteção contra abuso. Tente novamente.",
      values: formValues,
      turnstileResetId: randomUUID(),
    };
  }
  return { status: "error", message: "Revise os campos indicados.", errors: result.errors, values: formValues };
}
