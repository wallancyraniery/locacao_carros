import "server-only";

import { createHash } from "node:crypto";
import { getTurnstileEnvironment } from "@/config/turnstile_environment.server";
import type { LeadSubmissionProtection } from "../domain/lead_repository";
import { localTurnstileToken } from "../domain/turnstile_contract";
import { runWithLeadRepositoryDiagnostic } from "./lead_repository_diagnostic";

const siteverifyEndpoint = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type SiteverifyResponse = { success?: unknown; hostname?: unknown; action?: unknown; "error-codes"?: unknown };

// Only provider codes are diagnostic data; never echo arbitrary response strings.
const safeErrorCodes = new Set([
  "missing-input-secret", "invalid-input-secret", "missing-input-response",
  "invalid-input-response", "bad-request", "timeout-or-duplicate", "internal-error",
]);

function sanitizeErrorCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).filter((code): code is string =>
    typeof code === "string" && code.length <= 64 && safeErrorCodes.has(code));
}

function publicMetadata(value: unknown, pattern: RegExp, maxLength: number, sensitive: string[]) {
  return typeof value === "string" && value.length <= maxLength && pattern.test(value)
    && !sensitive.some((entry) => entry.length > 0 && value.includes(entry)) ? value : null;
}

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
      const payload: unknown = await response.json();
      const result: SiteverifyResponse = payload !== null && typeof payload === "object" && !Array.isArray(payload)
        ? payload : {};
      const siteverifySuccess = result.success === true;
      const hostnameMatches = result.hostname === environment.expectedHostname;
      const actionMatches = result.action === "submit_lead";
      const accepted = siteverifySuccess && hostnameMatches && actionMatches;
      if (!accepted) {
        const sensitive = [environment.secretKey, environment.siteKey, token, operationId, idempotencyKey, body.get("idempotency_key")!];
        console.warn({
          event: "lead_turnstile_rejected",
          siteverifySuccess,
          errorCodes: sanitizeErrorCodes(result["error-codes"]),
          hostnameMatches,
          actionMatches,
          responseHostname: publicMetadata(result.hostname, /^[a-zA-Z0-9.-]+$/, 253, sensitive),
          responseAction: publicMetadata(result.action, /^[a-zA-Z0-9_-]+$/, 32, sensitive),
        });
      }
      return accepted;
    });
  },
};
