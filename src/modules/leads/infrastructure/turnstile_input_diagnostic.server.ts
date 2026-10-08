import "server-only";

import { maxTurnstileTokenLength } from "../domain/turnstile_contract";

/** Called only after the schema rejects turnstileToken. Never echo the input. */
export function reportTurnstileInputRejected(token: unknown) {
  const tokenPresent = token !== null && token !== undefined;
  const tokenState = !tokenPresent ? "missing"
    : typeof token !== "string" ? "invalid"
    : !token.trim() ? "empty"
    : token.trim().length > maxTurnstileTokenLength ? "too_long" : "invalid";
  console.warn({ event: "lead_turnstile_input_rejected", tokenPresent, tokenState });
}
