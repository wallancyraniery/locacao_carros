import type { AvailabilityQuery } from "@/modules/vehicles/domain/availability_period";

export type ReservationContext = AvailabilityQuery & { operationId: string };
export type ReservationFormState = {
  status: "idle" | "success" | "error" | "unavailable" | "conflict";
  message?: string;
  errors?: Record<string, string[]>;
  values?: Record<string, string>;
  turnstileResetId?: string;
};
export type ReservationFormAction = (state: ReservationFormState, formData: FormData) => Promise<ReservationFormState>;
