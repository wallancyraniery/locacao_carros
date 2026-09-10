import { safeDatabaseErrorCode } from "@/modules/database/safe_error_code";

export type LeadRepositoryFailureStage =
  | "runtime_client_initialization"
  | "find_available_demo_vehicle"
  | "create_lead"
  | "verify_turnstile"
  | "submit_lead";

export type SafeLeadRepositoryDiagnostic = {
  stage: LeadRepositoryFailureStage;
  code: string | null;
};

export class LeadRepositoryDiagnosticError extends Error {
  readonly diagnostic: SafeLeadRepositoryDiagnostic;

  constructor(diagnostic: SafeLeadRepositoryDiagnostic) {
    super("Falha interna no envio de interesse.");
    this.name = "LeadRepositoryDiagnosticError";
    this.diagnostic = diagnostic;
  }
}

export async function runWithLeadRepositoryDiagnostic<T>(
  stage: Exclude<LeadRepositoryFailureStage, "submit_lead">,
  operation: () => T | Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof LeadRepositoryDiagnosticError) throw error;
    throw new LeadRepositoryDiagnosticError({ stage, code: safeDatabaseErrorCode(error) });
  }
}

export function safeLeadRepositoryDiagnostic(error: unknown): SafeLeadRepositoryDiagnostic {
  if (error instanceof LeadRepositoryDiagnosticError) return error.diagnostic;
  return { stage: "submit_lead", code: safeDatabaseErrorCode(error) };
}

export function reportUnexpectedLeadSubmissionError(error: unknown): void {
  console.error(safeLeadRepositoryDiagnostic(error));
}
