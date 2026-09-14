import { createHash } from "node:crypto";
import { LeadRetentionError } from "./lead_retention.mjs";

const candidatePredicate = (sql, organizationId, retentionDays) => sql`
  organization_id = ${organizationId}
  AND created_at <= transaction_timestamp() - (${retentionDays} * interval '1 day')
  AND status <> 'converted'
`;

const fingerprint = (ids) => createHash("sha256").update([...ids].sort().join("\n")).digest("hex");

export function createPostgresLeadRetentionAdapter(sql, validations) {
  return {
    validateTarget: validations.validateTarget,
    validateMigrations: validations.validateMigrations,
    validateStructure: validations.validateStructure,
    async preview(organizationId, retentionDays) {
      const candidates = await sql`SELECT id FROM rental_leads WHERE ${candidatePredicate(sql, organizationId, retentionDays)}`;
      return { organizationId, retentionDays, candidates: candidates.length, candidateFingerprint: fingerprint(candidates.map(({ id }) => id)) };
    },
    async deleteEligible(organizationId, retentionDays, expectedCandidates, expectedFingerprint) {
      return sql.begin(async (transaction) => {
        const candidates = await transaction`SELECT id FROM rental_leads WHERE ${candidatePredicate(transaction, organizationId, retentionDays)} FOR UPDATE`;
        const ids = candidates.map(({ id }) => id);
        if (candidates.length !== expectedCandidates || fingerprint(ids) !== expectedFingerprint) {
          throw new LeadRetentionError("CONCURRENT_STATE_CHANGE");
        }
        if (candidates.length === 0) return { organizationId, retentionDays, deletedLeads: 0, deletedHistory: 0, remainingCandidates: 0 };
        const deletedHistory = await transaction`DELETE FROM lead_status_history WHERE rental_lead_id = ANY(${ids}::uuid[]) RETURNING rental_lead_id`;
        const deletedLeads = await transaction`DELETE FROM rental_leads WHERE id = ANY(${ids}::uuid[]) AND ${candidatePredicate(transaction, organizationId, retentionDays)} RETURNING id`;
        const [remaining] = await transaction`SELECT count(*)::int AS candidates FROM rental_leads WHERE id = ANY(${ids}::uuid[])`;
        if (deletedLeads.length !== ids.length || remaining.candidates !== 0) throw new LeadRetentionError("CONCURRENT_STATE_CHANGE");
        return {
          organizationId,
          retentionDays,
          deletedLeads: deletedLeads.length,
          deletedHistory: deletedHistory.length,
          remainingCandidates: remaining.candidates,
        };
      });
    },
  };
}
