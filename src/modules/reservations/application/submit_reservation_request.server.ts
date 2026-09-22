import "server-only";
import type { LeadSubmissionProtection } from "@/modules/leads/domain/lead_repository";
import { leadSubmissionSchema, type LeadSubmissionInput } from "@/modules/leads/validation/lead_submission";
import { availabilityQuerySchema } from "@/modules/vehicles/domain/availability_period";
import type { ReservationSubmissionRepository, ReservationSubmissionResult } from "../domain/reservation_submission_repository";
import { reportReservationSubmissionError } from "../infrastructure/reservation_submission_diagnostic";

export type ReservationRequestInput = LeadSubmissionInput & { pickupDate: string; returnDate: string };
export type SubmitReservationRequestResult = ReservationSubmissionResult | { status: "ignored" | "blocked" };

export async function submitReservationRequest(
  repository: ReservationSubmissionRepository,
  protection: LeadSubmissionProtection,
  input: ReservationRequestInput,
): Promise<SubmitReservationRequestResult> {
  if (typeof input.website === "string" && input.website.trim()) return { status: "ignored" };
  const lead = leadSubmissionSchema.safeParse(input);
  const period = availabilityQuerySchema.safeParse(input);
  if (!lead.success || !period.success || period.data.pickupDate < "0001-01-01") return { status: "invalid" };
  try {
    if (!await protection.verify({ token: lead.data.turnstileToken, operationId: lead.data.operationId,
      idempotencyKey: lead.data.turnstileIdempotencyKey })) return { status: "blocked" };
  } catch (error) {
    reportReservationSubmissionError("reservation_turnstile", error);
    return { status: "error" };
  }
  try {
    // No independent availability precheck: the persistence boundary validates under lock.
    const { operationId, vehicleId, fullName, phone, email, city, hasDefinitiveLicense,
      usagePurpose, hasEar, driverPlatform, preferredContactTime } = lead.data;
    return await repository.submit({ operationId, vehicleId, fullName, phone, email, city,
      hasDefinitiveLicense, usagePurpose, hasEar, driverPlatform, preferredContactTime,
      pickupDate: period.data.pickupDate, returnDate: period.data.returnDate });
  } catch (error) {
    reportReservationSubmissionError("reservation_submission", error);
    // Do not expose SQL, tokens, or contact data. Retry uses the same operation ID.
    return { status: "error" };
  }
}
