export const leadRetentionDays: 90;
export const leadRetentionConfirmation: "DELETE_EXPIRED_UNCONVERTED_LEADS";
export class LeadRetentionError extends Error { code: string; constructor(code: string); }
export type LeadRetentionScope = { organizationId: string; retentionDays: number; candidates: number };
export type LeadRetentionPreview = LeadRetentionScope & { candidateFingerprint: string };
export type LeadRetentionDeletion = { organizationId: string; retentionDays: number; deletedLeads: number; deletedHistory: number; remainingCandidates: number };
export type LeadRetentionResult =
  | ({ status: "preview" | "already_compliant" } & LeadRetentionScope)
  | ({ status: "deleted" } & LeadRetentionDeletion);
export type LeadRetentionAdapter = {
  validateTarget(): Promise<void>;
  validateMigrations(): Promise<void>;
  validateStructure(): Promise<void>;
  preview(organizationId: string, retentionDays: number): Promise<LeadRetentionPreview>;
  deleteEligible(organizationId: string, retentionDays: number, expectedCandidates: number, expectedFingerprint: string): Promise<LeadRetentionDeletion>;
};
export function runLeadRetention(adapter: LeadRetentionAdapter, options: {
  organizationId: string;
  execute: boolean;
  confirmation?: string;
}): Promise<LeadRetentionResult>;
