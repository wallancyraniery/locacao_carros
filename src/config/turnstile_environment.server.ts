import "server-only";

import { parseTurnstileEnvironment } from "./turnstile_environment";

export function getTurnstileEnvironment() {
  return parseTurnstileEnvironment(process.env);
}

export function getTurnstileWidgetConfiguration() {
  const environment = getTurnstileEnvironment();
  return environment.mode === "local"
    ? { mode: "local" as const }
    : { mode: "cloudflare" as const, siteKey: environment.siteKey };
}
