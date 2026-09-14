import { z } from "zod";

export type PrivacyNoticeConfiguration =
  | { mode: "pending" }
  | { mode: "configured"; controllerName: string; contactLabel: string; contactHref: string };

export class PrivacyNoticeEnvironmentError extends Error {
  readonly code = "INVALID_PRIVACY_NOTICE_ENVIRONMENT";

  constructor() {
    super("Configuração pública de privacidade incompleta.");
    this.name = "PrivacyNoticeEnvironmentError";
  }
}

const officialText = z.string().trim().min(2).max(160).refine(
  (value) => !/(?:example|exemplo|placeholder|defina|pendente)/i.test(value),
);

const officialContact = z.string().trim().url().refine((value) => {
  const parsed = new URL(value);
  return ["https:", "mailto:", "tel:"].includes(parsed.protocol)
    && !parsed.username
    && !parsed.password
    && !/(?:example|exemplo|placeholder|defina|pendente|\.(?:test|invalid|localhost)(?:[/:?#]|$))/i.test(value);
});

export function parsePrivacyNoticeEnvironment(environment: Record<string, string | undefined>): PrivacyNoticeConfiguration {
  const result = z.object({
    PRIVACY_CONTROLLER_NAME: officialText,
    PRIVACY_CONTACT_LABEL: officialText,
    PRIVACY_CONTACT_URL: officialContact,
  }).safeParse(environment);

  if (result.success) return {
    mode: "configured",
    controllerName: result.data.PRIVACY_CONTROLLER_NAME,
    contactLabel: result.data.PRIVACY_CONTACT_LABEL,
    contactHref: result.data.PRIVACY_CONTACT_URL,
  };
  if (environment.NODE_ENV === "production") throw new PrivacyNoticeEnvironmentError();
  return { mode: "pending" };
}
