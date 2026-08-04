"use server";

import { submitLead, type SubmitLeadResult } from "../application/submit_lead";
import type { LeadFormState } from "../components/lead_form_state";
import { drizzleLeadRepository } from "../infrastructure/drizzle_lead_repository.server";
import type { LeadSubmissionInput } from "../validation/lead_submission";

export async function submitLeadAction(_state: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const values = Object.fromEntries([...formData.entries()].map(([key, value]) => [key, typeof value === "string" ? value : ""]));
  let result: SubmitLeadResult;
  try {
    result = await submitLead(drizzleLeadRepository, values as LeadSubmissionInput);
  } catch {
    return { status: "error", message: "Não foi possível enviar seu interesse agora. Tente novamente mais tarde.", values };
  }
  if (result.status === "success" || result.status === "ignored") {
    return { status: "success", message: "Interesse enviado com sucesso. A locadora analisará seus dados e entrará em contato." };
  }
  return { status: "error", message: "Revise os campos indicados.", errors: result.errors, values };
}
