export const expectedRuntimeMembership = {
  grantedRole: "lead_intake_runtime",
  member: "postgres",
  grantor: "supabase_admin",
  adminOption: true,
  inheritOption: false,
  setOption: false,
} as const;

export const expectedRuntimeColumnPrivileges = new Set([
  "organizations:id:SELECT",
  ...["id", "organization_id", "status", "is_demo"].map((column) => `vehicles:${column}:SELECT`),
  ...[
    "id", "operation_id", "organization_id", "vehicle_id", "full_name", "phone", "email", "city",
    "has_definitive_license", "usage_purpose", "has_ear", "driver_platform",
    "preferred_contact_time", "status",
  ].map((column) => `rental_leads:${column}:INSERT`),
]);

export type RuntimeMembership = {
  grantedRole: string;
  member: string;
  grantor: string;
  adminOption: boolean;
  inheritOption: boolean;
  setOption: boolean;
};

export function hasExactRuntimeMemberships(memberships: RuntimeMembership[]): boolean {
  return memberships.length === 1
    && Object.entries(expectedRuntimeMembership).every(([key, value]) =>
      memberships[0]?.[key as keyof RuntimeMembership] === value);
}

export function runtimeDiagnosticErrorCode(error: unknown): string | undefined {
  const code = typeof error === "object" && error !== null && "code" in error
    && typeof error.code === "string" && /^[A-Z0-9_]{2,50}$/.test(error.code)
    ? error.code
    : undefined;
  return code;
}

export function safeRuntimeDiagnosticError(error: unknown): Error {
  const code = runtimeDiagnosticErrorCode(error);
  const category = code === "28P01" || code === "28000" ? "autenticação"
    : code === "ENOTFOUND" || code === "EAI_AGAIN" ? "DNS"
      : code === "CONNECT_TIMEOUT" || code === "ETIMEDOUT" ? "timeout"
        : code && /TLS|CERT|ISSUER|SIGNATURE|SELF_SIGNED|ALTNAME/.test(code) ? "certificado TLS"
          : code === "42501" ? "permissão" : "conectividade ou contrato";
  return new Error(`Diagnóstico do runtime Supabase recusado: ${category}${code ? ` (${code})` : ""}.`);
}
