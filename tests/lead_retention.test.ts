import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  leadRetentionConfirmation,
  LeadRetentionError,
  runLeadRetention,
  type LeadRetentionAdapter,
} from "../scripts/lead_retention.mjs";

const organizationId = "10000000-0000-4000-8000-000000000001";

function adapter(candidates = 2) {
  const events: string[] = [];
  const implementation: LeadRetentionAdapter = {
    validateTarget: vi.fn(async () => { events.push("validateTarget"); }),
    validateMigrations: vi.fn(async () => { events.push("validateMigrations"); }),
    validateStructure: vi.fn(async () => { events.push("validateStructure"); }),
    preview: vi.fn(async (id, days) => {
      events.push("preview");
      return { organizationId: id, retentionDays: days, candidates, candidateFingerprint: "synthetic-fingerprint" };
    }),
    deleteEligible: vi.fn(async (id, days) => {
      events.push("deleteEligible");
      return { organizationId: id, retentionDays: days, deletedLeads: candidates, deletedHistory: 1, remainingCandidates: 0 };
    }),
  };
  return { implementation, events };
}

describe("procedimento controlado de retenção", () => {
  it("faz prévia após todas as validações e sem escrita", async () => {
    const { implementation, events } = adapter();
    await expect(runLeadRetention(implementation, { organizationId, execute: false })).resolves.toEqual({
      status: "preview", organizationId, retentionDays: 90, candidates: 2,
    });
    expect(events).toEqual(["validateTarget", "validateMigrations", "validateStructure", "preview"]);
    expect(implementation.deleteEligible).not.toHaveBeenCalled();
  });

  it("exige confirmação antes de validar ou escrever", async () => {
    const { implementation, events } = adapter();
    await expect(runLeadRetention(implementation, { organizationId, execute: true })).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    expect(events).toEqual([]);
  });

  it("elimina somente após validações, prévia e confirmação", async () => {
    const { implementation, events } = adapter();
    await expect(runLeadRetention(implementation, {
      organizationId, execute: true, confirmation: leadRetentionConfirmation,
    })).resolves.toMatchObject({ status: "deleted", deletedLeads: 2, remainingCandidates: 0 });
    expect(events).toEqual(["validateTarget", "validateMigrations", "validateStructure", "preview", "deleteEligible"]);
    expect(implementation.deleteEligible).toHaveBeenCalledWith(organizationId, 90, 2, "synthetic-fingerprint");
  });

  it.each(["validateTarget", "validateMigrations", "validateStructure"] as const)("não escreve quando %s falha", async (stage) => {
    const { implementation } = adapter();
    vi.mocked(implementation[stage]).mockRejectedValueOnce(new LeadRetentionError("VALIDATION_FAILURE"));
    await expect(runLeadRetention(implementation, {
      organizationId, execute: true, confirmation: leadRetentionConfirmation,
    })).rejects.toMatchObject({ code: "VALIDATION_FAILURE" });
    expect(implementation.deleteEligible).not.toHaveBeenCalled();
  });

  it("é idempotente quando não existem candidatos", async () => {
    const { implementation } = adapter(0);
    await expect(runLeadRetention(implementation, {
      organizationId, execute: true, confirmation: leadRetentionConfirmation,
    })).resolves.toEqual({ status: "already_compliant", organizationId, retentionDays: 90, candidates: 0 });
    expect(implementation.deleteEligible).not.toHaveBeenCalled();
  });

  it("recusa divergência posterior sem expor dados", async () => {
    const { implementation } = adapter();
    vi.mocked(implementation.deleteEligible).mockResolvedValueOnce({
      organizationId, retentionDays: 90, deletedLeads: 1, deletedHistory: 0, remainingCandidates: 1,
    });
    await expect(runLeadRetention(implementation, {
      organizationId, execute: true, confirmation: leadRetentionConfirmation,
    })).rejects.toMatchObject({ code: "POST_DELETE_DIVERGENCE" });
  });

  it("mantém executável administrativo explícito e logs sanitizados", () => {
    const source = readFileSync("scripts/retain_supabase_leads.mjs", "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    expect(source).toContain(".env.supabase.local");
    expect(source).not.toContain(".env.supabase.runtime.local");
    expect(source).toContain("port: 5432");
    expect(source).toContain("rejectUnauthorized: true");
    expect(source).toContain("servername: url.hostname");
    expect(source).not.toMatch(/console\.(?:log|error)\([^)]*(?:full_name|phone|email)/);
    expect(packageJson.scripts["db:retain:supabase:leads"]).toBe("node scripts/retain_supabase_leads.mjs");
  });
});
