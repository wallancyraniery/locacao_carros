export type AvailabilityFormState = {
  status: "idle" | "available" | "unavailable" | "invalid" | "error";
  pickupDate?: string;
  returnDate?: string;
  message?: string;
};
