import type { NewLead } from "@/modules/leads/domain/lead_repository";

export type ReservationSubmission = Omit<NewLead, "organizationId"> & {
  pickupDate: string;
  returnDate: string;
};

export type ReservationSubmissionResult =
  | { status: "success"; leadId: string; reservationRequestId: string; requestStatus: "requested" }
  | { status: "unavailable" | "conflict" | "invalid" | "error" };

export interface ReservationSubmissionRepository {
  submit(input: ReservationSubmission): Promise<ReservationSubmissionResult>;
}
