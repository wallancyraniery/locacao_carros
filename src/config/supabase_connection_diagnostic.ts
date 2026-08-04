export type BackendSslObservation = {
  observed: boolean | null;
  scope: "session_pooler_backend" | "direct_backend";
  conclusiveForClientTls: boolean;
};

export type RequireModeTlsHandshake = {
  endpointTlsNegotiated: boolean;
  protocolIdentified: boolean;
  cipherIdentified: boolean;
  certificateIdentityVerified: false;
  certificateIdentityVerificationReason: "not_performed_in_require_mode";
};

export function interpretRequireModeTlsHandshake(exitCode: number | null, output: string): RequireModeTlsHandshake {
  const protocolIdentified = /^Protocol version:\s*TLS/m.test(output);
  const cipherIdentified = /^(Ciphersuite|Cipher)\s*:/m.test(output);
  return {
    endpointTlsNegotiated: exitCode === 0 && /^(CONNECTION ESTABLISHED|CONNECTED)/m.test(output) && protocolIdentified && cipherIdentified,
    protocolIdentified,
    cipherIdentified,
    certificateIdentityVerified: false,
    certificateIdentityVerificationReason: "not_performed_in_require_mode",
  };
}

export function interpretBackendSslObservation(host: string, observed: boolean | undefined): BackendSslObservation {
  const sessionPooler = host.endsWith(".pooler.supabase.com");
  return {
    observed: observed ?? null,
    scope: sessionPooler ? "session_pooler_backend" : "direct_backend",
    conclusiveForClientTls: !sessionPooler,
  };
}
