import "server-only";
import { getPrivacyNoticeConfiguration } from "@/config/privacy_notice_environment.server";
import { loadStorefrontInterestPrivacy } from "@/modules/storefront/queries.server";
import { LeadRepositoryDiagnosticError } from "./lead_repository_diagnostic";

export const leadPrivacyReadiness = {
  async verify(input: { storefrontSlug?: string; vehicleId: string }) {
    try {
      if (!input.storefrontSlug) { getPrivacyNoticeConfiguration(); return true; }
      return (await loadStorefrontInterestPrivacy(input.storefrontSlug, input.vehicleId)).status === "ready";
    } catch (error) {
      throw new LeadRepositoryDiagnosticError({ stage: "verify_privacy_readiness" as never, code: error instanceof Error && error.name === "PrivacyNoticeEnvironmentError" ? "INVALID_PRIVACY_NOTICE_ENVIRONMENT" : null });
    }
  },
};
