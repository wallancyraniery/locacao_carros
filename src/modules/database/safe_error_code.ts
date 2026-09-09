// Unknown codes remain private, even when they resemble a valid identifier.
const safeErrorCodes = new Set([
  "08000", "08001", "08003", "08004", "08006", "08007", "08P01",
  "22001", "22003", "22007", "22P02", "23502", "23503", "23505", "23514",
  "25006", "25P02", "28000", "28P01", "3D000", "3F000", "40001", "40P01",
  "42501", "42601", "42703", "42804", "42P01", "53100", "53200", "53300",
  "54000", "55000", "57014", "57P01", "57P02", "57P03", "58000", "XX000",
  "EACCES", "ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH",
  "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE",
  "INVALID_RUNTIME_DATABASE_ENVIRONMENT", "CONNECT_TIMEOUT", "CONNECTION_CLOSED",
  "CONNECTION_ENDED", "CONNECTION_DESTROYED",
  "ERR_TLS_CERT_ALTNAME_INVALID", "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_SSL_WRONG_VERSION_NUMBER",
]);

export function safeDatabaseErrorCode(error: unknown): string | null {
  const seen = new Set<object>();
  let current = error;
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== "object" || seen.has(current)) return null;
    seen.add(current);
    if ("code" in current && typeof current.code === "string" && safeErrorCodes.has(current.code)) {
      return current.code;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return null;
}
