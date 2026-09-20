import { createHash } from "node:crypto";
import { LeadRetentionError } from "./lead_retention.mjs";

const candidatePredicate = (sql, organizationId, retentionDays) => sql`
  rental_leads.organization_id = ${organizationId}
  AND rental_leads.created_at <= transaction_timestamp() - (${retentionDays} * interval '1 day')
  AND rental_leads.status <> 'converted'
`;

const withoutOperationalLinks = (sql) => sql`
  NOT EXISTS (SELECT 1 FROM reservation_requests r
    WHERE r.organization_id = rental_leads.organization_id AND r.lead_id = rental_leads.id)
  AND NOT EXISTS (SELECT 1 FROM waitlist_entries w
    WHERE w.organization_id = rental_leads.organization_id AND w.lead_id = rental_leads.id)
`;

const fingerprint = (ids) => createHash("sha256").update([...ids].sort().join("\n")).digest("hex");

export function createPostgresLeadRetentionAdapter(sql, validations) {
  return {
    validateTarget: validations.validateTarget,
    validateMigrations: validations.validateMigrations,
    validateStructure: validations.validateStructure,
    async preview(organizationId, retentionDays) {
      const candidates = await sql`SELECT id FROM rental_leads WHERE ${candidatePredicate(sql, organizationId, retentionDays)} AND ${withoutOperationalLinks(sql)}`;
      const candidateIds = candidates.map(({ id }) => id);
      // Internal authorization snapshot only; runLeadRetention never exposes IDs.
      return { organizationId, retentionDays, candidates: candidates.length, candidateFingerprint: fingerprint(candidateIds), candidateIds };
    },
    async deleteEligible(organizationId, retentionDays, expectedCandidates, expectedFingerprint, expectedIds) {
      if (!expectedIds || new Set(expectedIds).size !== expectedCandidates || expectedIds.length !== expectedCandidates || fingerprint(expectedIds) !== expectedFingerprint) {
        throw new LeadRetentionError("CONCURRENT_STATE_CHANGE");
      }
      return sql.begin("isolation level read committed", async (transaction) => {
        // FOR UPDATE conflicts with the KEY SHARE lock acquired by referencing FKs.
        // A separate statement after locking sees dependencies committed while we waited.
        const locked = await transaction`SELECT id FROM rental_leads WHERE id = ANY(${expectedIds}::uuid[])
          AND ${candidatePredicate(transaction, organizationId, retentionDays)} ORDER BY id FOR UPDATE`;
        if (locked.length !== expectedCandidates || fingerprint(locked.map(({ id }) => id)) !== expectedFingerprint) {
          throw new LeadRetentionError("CONCURRENT_STATE_CHANGE");
        }
        const candidates = await transaction`SELECT id FROM rental_leads WHERE ${candidatePredicate(transaction, organizationId, retentionDays)} AND ${withoutOperationalLinks(transaction)}`;
        const ids = candidates.map(({ id }) => id);
        const authorizedIds = new Set(expectedIds);
        if (ids.some((id) => !authorizedIds.has(id))) {
          throw new LeadRetentionError("CONCURRENT_STATE_CHANGE");
        }
        const preservedLinked = expectedCandidates - ids.length;
        if (candidates.length === 0) return { organizationId, retentionDays, deletedLeads: 0, deletedHistory: 0, remainingCandidates: 0, preservedLinked };
        const deletedHistory = await transaction`DELETE FROM lead_status_history WHERE rental_lead_id = ANY(${ids}::uuid[]) RETURNING rental_lead_id`;
        const deletedLeads = await transaction`DELETE FROM rental_leads WHERE id = ANY(${ids}::uuid[]) AND ${candidatePredicate(transaction, organizationId, retentionDays)} AND ${withoutOperationalLinks(transaction)} RETURNING id`;
        const [remaining] = await transaction`SELECT count(*)::int AS candidates FROM rental_leads WHERE id = ANY(${ids}::uuid[])`;
        if (deletedLeads.length !== ids.length || remaining.candidates !== 0) throw new LeadRetentionError("CONCURRENT_STATE_CHANGE");
        return {
          organizationId,
          retentionDays,
          deletedLeads: deletedLeads.length,
          deletedHistory: deletedHistory.length,
          remainingCandidates: remaining.candidates,
          preservedLinked,
        };
      });
    },
  };
}
