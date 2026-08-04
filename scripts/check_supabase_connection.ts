import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import postgres from "postgres";
import { expect, it } from "vitest";
import {
  interpretBackendSslObservation,
  interpretRequireModeTlsHandshake,
  type RequireModeTlsHandshake,
} from "@/config/supabase_connection_diagnostic";
import { createSupabaseMigrationCredentials, parseSupabaseMigrationEnvironment } from "@/config/supabase_environment";

type SafeDiagnostic = {
  contractApproved: boolean;
  clientTlsPolicy: "require" | "invalid";
  serverSslEnforcement: "manually_enabled";
  regionSaEast1: boolean;
  endpointTlsNegotiated: boolean;
  tlsProtocolIdentified: boolean;
  tlsCipherIdentified: boolean;
  certificateIdentityVerified: false;
  certificateIdentityVerificationReason: "not_performed_in_require_mode";
  postgresConnectivity: boolean;
  backendSslObservation: boolean | null;
  backendObservationConclusiveForClientTls: false;
  databasePostgres: boolean;
  applicationTableCount: number;
  drizzleJournalExists: boolean;
  connectionClosed: boolean;
};

function verifyPostgresTlsEndpoint(host: string, port: number, timeoutMs = 8_000): Promise<RequireModeTlsHandshake> {
  return new Promise((resolve, reject) => {
    let output = "";
    let timedOut = false;
    const child = spawn("openssl", [
      "s_client",
      "-starttls", "postgres",
      "-connect", `${host}:${port}`,
      "-servername", host,
      "-brief",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    const collect = (chunk: Buffer) => {
      if (output.length < 32_768) output += chunk.toString("utf8", 0, 32_768 - output.length);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.once("error", () => {
      clearTimeout(timeout);
      reject(new Error("Handshake TLS recusado: ferramenta indisponível."));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) return reject(new Error("Handshake TLS recusado na etapa de timeout."));
      const result = interpretRequireModeTlsHandshake(code, output);
      output = "";
      if (!result.protocolIdentified) return reject(new Error("Handshake TLS recusado na etapa de protocolo."));
      if (!result.cipherIdentified) return reject(new Error("Handshake TLS recusado na etapa de cipher."));
      if (!result.endpointTlsNegotiated) return reject(new Error("Handshake TLS recusado na etapa de negociação STARTTLS."));
      resolve(result);
    });
  });
}

function safeConnectionError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith("Handshake TLS recusado:")) return error;
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
  const category = code === "28P01" || code === "28000"
    ? "autenticação"
    : code === "ENOTFOUND" || code === "EAI_AGAIN"
      ? "DNS"
      : code === "CONNECT_TIMEOUT" || code === "ETIMEDOUT"
        ? "timeout"
        : code?.includes("SSL") || code?.includes("CERT")
          ? "SSL"
          : "conectividade";
  const safeCode = code && /^[A-Z0-9_]{2,20}$/.test(code) ? ` (${code})` : "";
  return new Error(`Diagnóstico Supabase recusado na etapa de conexão: ${category}${safeCode}.`);
}

it("confirma conectividade remota segura sem executar escritas", async () => {
  const variables = parseEnv(readFileSync(".env.supabase.local", "utf8"));
  const environment = parseSupabaseMigrationEnvironment(variables);
  const credentials = createSupabaseMigrationCredentials(environment);
  const regionSaEast1 = credentials.host.includes("sa-east-1") && !credentials.host.includes("ca-central-1");
  let handshake: RequireModeTlsHandshake | undefined;
  let connectionClosed = true;
  let diagnostic: Omit<SafeDiagnostic, "connectionClosed"> | undefined;

  try {
    expect(credentials.ssl).toBe("require");
    expect(regionSaEast1).toBe(true);
    handshake = await verifyPostgresTlsEndpoint(credentials.host, credentials.port);

    const sql = postgres({ ...credentials, max: 1, connect_timeout: 6, idle_timeout: 6, prepare: false });
    connectionClosed = false;
    try {
      const connection = await sql`SELECT 1 AS connection_ok`;
      const server = await sql`SELECT current_database() = ${"postgres"} AS database_ok`;
      const ssl = await sql`SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`;
      const applicationTables = await sql`
        SELECT count(*)::integer AS count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ${"public"}
          AND c.relkind IN (${"r"}, ${"p"})
          AND c.relname IN (${"organizations"}, ${"vehicles"}, ${"rental_leads"}, ${"lead_status_history"})
      `;
      const drizzleJournal = await sql`
        SELECT EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = ${"drizzle"}
            AND c.relname = ${"__drizzle_migrations"}
            AND c.relkind IN (${"r"}, ${"p"})
        ) AS journal_exists
      `;

      diagnostic = {
        contractApproved: true,
        clientTlsPolicy: credentials.ssl,
        serverSslEnforcement: "manually_enabled",
        regionSaEast1,
        endpointTlsNegotiated: handshake.endpointTlsNegotiated,
        tlsProtocolIdentified: handshake.protocolIdentified,
        tlsCipherIdentified: handshake.cipherIdentified,
        certificateIdentityVerified: handshake.certificateIdentityVerified,
        certificateIdentityVerificationReason: handshake.certificateIdentityVerificationReason,
        postgresConnectivity: connection[0]?.connection_ok === 1,
        backendSslObservation: interpretBackendSslObservation(credentials.host, ssl[0]?.ssl).observed,
        backendObservationConclusiveForClientTls: false,
        databasePostgres: server[0]?.database_ok === true,
        applicationTableCount: Number(applicationTables[0]?.count),
        drizzleJournalExists: drizzleJournal[0]?.journal_exists === true,
      };
      expect(diagnostic.postgresConnectivity).toBe(true);
      expect(diagnostic.databasePostgres).toBe(true);
      expect(diagnostic.applicationTableCount).toBe(0);
      expect(diagnostic.drizzleJournalExists).toBe(false);
    } finally {
      await sql.end({ timeout: 2 });
      connectionClosed = true;
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AssertionError") throw error;
    throw safeConnectionError(error);
  } finally {
    const safeDiagnostic: SafeDiagnostic = {
      contractApproved: diagnostic?.contractApproved ?? false,
      clientTlsPolicy: diagnostic?.clientTlsPolicy ?? (credentials.ssl === "require" ? "require" : "invalid"),
      serverSslEnforcement: "manually_enabled",
      regionSaEast1,
      endpointTlsNegotiated: diagnostic?.endpointTlsNegotiated ?? handshake?.endpointTlsNegotiated ?? false,
      tlsProtocolIdentified: diagnostic?.tlsProtocolIdentified ?? handshake?.protocolIdentified ?? false,
      tlsCipherIdentified: diagnostic?.tlsCipherIdentified ?? handshake?.cipherIdentified ?? false,
      certificateIdentityVerified: false,
      certificateIdentityVerificationReason: "not_performed_in_require_mode",
      postgresConnectivity: diagnostic?.postgresConnectivity ?? false,
      backendSslObservation: diagnostic?.backendSslObservation ?? null,
      backendObservationConclusiveForClientTls: false,
      databasePostgres: diagnostic?.databasePostgres ?? false,
      applicationTableCount: diagnostic?.applicationTableCount ?? 0,
      drizzleJournalExists: diagnostic?.drizzleJournalExists ?? false,
      connectionClosed,
    };
    console.log(JSON.stringify(safeDiagnostic));
    if (!connectionClosed) throw new Error("Diagnóstico Supabase recusado na etapa de encerramento da conexão.");
  }
});
