import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/modules/database/client.server";
import type { ReservationSubmissionRepository } from "../domain/reservation_submission_repository";
import { reportReservationSubmissionError } from "./reservation_submission_diagnostic";

const receiptSchema = z.array(z.object({
  lead_id: z.uuid(), reservation_request_id: z.uuid(), status: z.literal("requested"),
})).length(1);

function submissionErrorCode(error: unknown): unknown {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error) return error.code;
  if ("cause" in error && error.cause && typeof error.cause === "object" && "code" in error.cause) return error.cause.code;
}

export const reservationSubmissionRepository: ReservationSubmissionRepository = {
  async submit(input) {
    try {
      const rows = await getDatabase().execute(sql`
        SELECT * FROM reservation_submission_private.submit(
          ${input.operationId}::uuid, ${input.vehicleId}::uuid, ${input.pickupDate}::date, ${input.returnDate}::date,
          ${input.fullName}::text, ${input.phone}::text, ${input.email}::text, ${input.city}::text,
          ${input.hasDefinitiveLicense}::boolean, ${input.usagePurpose}::text, ${input.hasEar}::boolean,
          ${input.driverPlatform}::text, ${input.preferredContactTime}::text
        )
      `);
      const receipt = receiptSchema.safeParse(rows);
      if (!receipt.success) {
        reportReservationSubmissionError("reservation_submission");
        return { status: "error" };
      }
      const row = receipt.data[0];
      return { status: "success", leadId: row.lead_id, reservationRequestId: row.reservation_request_id, requestStatus: row.status };
    } catch (error) {
      switch (submissionErrorCode(error)) {
        case "P1001": return { status: "invalid" };
        case "P1002": return { status: "unavailable" };
        case "P1003": return { status: "conflict" };
        default:
          reportReservationSubmissionError("reservation_submission", error);
          return { status: "error" };
      }
    }
  },
};
