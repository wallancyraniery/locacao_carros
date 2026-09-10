import "server-only";

import { createHash } from "node:crypto";
import { getTurnstileEnvironment } from "@/config/turnstile_environment.server";
import type { LeadSubmissionProtection } from "../domain/lead_repository";
import { localTurnstileToken } from "../domain/turnstile_contract";
import { runWithLeadRepositoryDiagnostic } from "./lead_repository_diagnostic";

const siteverifyEndpoint = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type SiteverifyResponse = { success?: unknown; hostname?: unknown; action?: unknown };

function siteverifyIdempotencyKey(operationId: string, attemptId: string) {
  const bytes = createHash("sha256").update(operationId).update("\0").update(attemptId).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const turnstileSubmissionProtection: LeadSubmissionProtection = {
  async verify({ token, operationId, idempotencyKey }) {
    return runWithLeadRepositoryDiagnostic("verify_turnstile", async () => {
      const environment = getTurnstileEnvironment();
      if (environment.mode === "local") return token === localTurnstileToken;

      const body = new URLSearchParams({
        secret: environment.secretKey,
        response: token,
        idempotency_key: siteverifyIdempotencyKey(operationId, idempotencyKey),
      });
      const response = await fetch(siteverifyEndpoint, {
        method: "POST",
        body,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw Object.assign(new Error("Turnstile indisponível."), { code: "TURNSTILE_UNAVAILABLE" });
      const result = await response.json() as SiteverifyResponse;
      return result.success === true
        && result.hostname === environment.expectedHostname
        && result.action === "submit_lead";
    });
  },
};
