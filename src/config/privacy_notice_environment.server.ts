import "server-only";

import { parsePrivacyNoticeEnvironment } from "./privacy_notice_environment";

export function getPrivacyNoticeConfiguration() {
  return parsePrivacyNoticeEnvironment(process.env);
}
