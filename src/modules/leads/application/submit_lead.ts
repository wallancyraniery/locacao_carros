import type { LeadRepository } from "../domain/lead_repository";
import { formatLeadValidationErrors, leadSubmissionSchema, type LeadSubmissionInput } from "../validation/lead_submission";

export type SubmitLeadResult =
  | { status: "success"; leadId: string }
  | { status: "ignored" }
  | { status: "invalid"; errors: Record<string, string[]> }
  | { status: "unavailable"; errors: Record<string, string[]> };

export async function submitLead(repository: LeadRepository, input: LeadSubmissionInput): Promise<SubmitLeadResult> {
  if (typeof input.website === "string" && input.website.trim()) return { status: "ignored" };

  const parsed = leadSubmissionSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", errors: formatLeadValidationErrors(parsed.error) };

  const vehicle = await repository.findAvailableDemoVehicle(parsed.data.vehicleId);
  if (!vehicle) return { status: "unavailable", errors: { vehicleId: ["O veículo selecionado não está disponível."] } };

  const created = await repository.createLead({
    organizationId: vehicle.organizationId,
    vehicleId: vehicle.id,
    fullName: parsed.data.fullName,
    phone: parsed.data.phone,
    email: parsed.data.email,
    city: parsed.data.city,
    hasDefinitiveLicense: parsed.data.hasDefinitiveLicense,
    driverPlatform: parsed.data.driverPlatform,
    preferredContactTime: parsed.data.preferredContactTime,
  });
  return { status: "success", leadId: created.id };
}
