export type AvailableDemoVehicle = { id: string; organizationId: string };

export type NewLead = {
  operationId: string;
  organizationId: string;
  vehicleId: string;
  fullName: string;
  phone: string;
  email: string | null;
  city: string;
  hasDefinitiveLicense: boolean;
  usagePurpose: UsagePurpose;
  hasEar: boolean | null;
  driverPlatform: string | null;
  preferredContactTime: string | null;
};

export type LeadSubmissionProtection = {
  verify(input: { token: string; operationId: string; idempotencyKey: string }): Promise<boolean>;
};

export interface LeadRepository {
  findAvailableDemoVehicle(vehicleId: string): Promise<AvailableDemoVehicle | null>;
  createLead(lead: NewLead): Promise<{ id: string }>;
}
import type { UsagePurpose } from "@/modules/rentals/domain/rental_terms";
