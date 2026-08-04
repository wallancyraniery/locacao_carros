export type LeadFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: Record<string, string[]>;
  values?: Record<string, string>;
};

export const initialLeadFormState: LeadFormState = { status: "idle" };
