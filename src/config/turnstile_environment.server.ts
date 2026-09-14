import "server-only";

import { getProductionEnvironment } from "./production_environment.server";
import { parseTurnstileEnvironment } from "./turnstile_environment";

export function getTurnstileEnvironment() {
  return process.env.NODE_ENV === "production"
    ? getProductionEnvironment().turnstile
    : parseTurnstileEnvironment(process.env);
}

export function getTurnstileWidgetConfiguration() {
  const environment = getTurnstileEnvironment();
  return environment.mode === "local"
    ? { mode: "local" as const }
    : { mode: "cloudflare" as const, siteKey: environment.siteKey };
}
