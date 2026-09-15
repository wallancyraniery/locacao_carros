export const leadRetentionDays = 90;
export const leadRetentionConfirmation = "DELETE_EXPIRED_UNCONVERTED_LEADS";

export class LeadRetentionError extends Error {
  constructor(code) {
    super("Procedimento de retenção recusado.");
    this.name = "LeadRetentionError";
    this.code = code;
  }
}

function assertUuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value ?? "")) {
    throw new LeadRetentionError("INVALID_ORGANIZATION_ID");
  }
}

export async function runLeadRetention(adapter, options) {
  assertUuid(options.organizationId);
  if (options.execute && options.confirmation !== leadRetentionConfirmation) {
    throw new LeadRetentionError("CONFIRMATION_REQUIRED");
  }

  await adapter.validateTarget();
  await adapter.validateMigrations();
  await adapter.validateStructure();
  const preview = await adapter.preview(options.organizationId, leadRetentionDays);
  const publicPreview = { organizationId: preview.organizationId, retentionDays: preview.retentionDays, candidates: preview.candidates };
  if (!options.execute || preview.candidates === 0) {
    return { status: preview.candidates === 0 ? "already_compliant" : "preview", ...publicPreview };
  }

  const result = await adapter.deleteEligible(
    options.organizationId, leadRetentionDays, preview.candidates, preview.candidateFingerprint,
  );
  if (result.remainingCandidates !== 0 || result.deletedLeads !== preview.candidates) {
    throw new LeadRetentionError("POST_DELETE_DIVERGENCE");
  }
  return { status: "deleted", ...result };
}
