import { safeDatabaseErrorCode } from "@/modules/database/safe_error_code";
import { LeadRepositoryDiagnosticError } from "@/modules/leads/infrastructure/lead_repository_diagnostic";

type ReservationFailureStage = "reservation_submission" | "reservation_turnstile";

export function reportReservationSubmissionError(stage: ReservationFailureStage, error?: unknown): void {
  const source = error instanceof LeadRepositoryDiagnosticError ? error.diagnostic : error;
  console.error({ stage, code: safeDatabaseErrorCode(source) });
}
