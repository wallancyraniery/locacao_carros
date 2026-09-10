import { z } from "zod";

export type TurnstileEnvironment =
  | { mode: "local" }
  | { mode: "cloudflare"; siteKey: string; secretKey: string; expectedHostname: string };

export class TurnstileEnvironmentError extends Error {
  readonly code = "INVALID_TURNSTILE_ENVIRONMENT";

  constructor() {
    super("Configuração da proteção contra abuso inválida.");
    this.name = "TurnstileEnvironmentError";
  }
}

const nonEmpty = z.string().trim().min(1);
const hostname = nonEmpty.refine((value) => {
  try {
    const parsed = new URL(`https://${value}`);
    return parsed.hostname === value && parsed.pathname === "/" && !parsed.port;
  } catch {
    return false;
  }
});

export function parseTurnstileEnvironment(environment: Record<string, string | undefined>): TurnstileEnvironment {
  const mode = environment.TURNSTILE_MODE?.trim() || (environment.NODE_ENV === "production" ? "" : "local");
  if (mode === "local") {
    if (environment.NODE_ENV === "production") throw new TurnstileEnvironmentError();
    return { mode };
  }
  if (mode !== "cloudflare") throw new TurnstileEnvironmentError();

  const result = z.object({
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: nonEmpty,
    TURNSTILE_SECRET_KEY: nonEmpty,
    TURNSTILE_EXPECTED_HOSTNAME: hostname,
  }).safeParse(environment);
  if (!result.success) throw new TurnstileEnvironmentError();
  return {
    mode,
    siteKey: result.data.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    secretKey: result.data.TURNSTILE_SECRET_KEY,
    expectedHostname: result.data.TURNSTILE_EXPECTED_HOSTNAME,
  };
}
