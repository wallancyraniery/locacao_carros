import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { interpretBackendSslObservation, interpretRequireModeTlsHandshake } from "@/config/supabase_connection_diagnostic";
import {
  createSupabaseMigrationCredentials,
  parseSupabaseMigrationEnvironment,
  parseSupabasePublicEnvironment,
  SupabaseEnvironmentError,
} from "@/config/supabase_environment";

vi.mock("server-only", () => ({}));

const projectRef = "abcdefghijklmnopqrst";
const publicEnvironment = {
  SUPABASE_PROJECT_REF: projectRef,
  SUPABASE_PROJECT_URL: `https://${projectRef}.supabase.co`,
  SUPABASE_PUBLISHABLE_KEY: "publishable_test_value",
};
const migrationEnvironment = {
  SUPABASE_PROJECT_REF: projectRef,
  SUPABASE_MIGRATION_DATABASE_URL: `postgresql://postgres.${projectRef}:password_test_value@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require`,
  SUPABASE_REMOTE_MIGRATION_CONFIRMATION: `locacao_carros:${projectRef}`,
};

describe("contrato público do Supabase", () => {
  it("aceita um ambiente público válido", () => {
    expect(parseSupabasePublicEnvironment(publicEnvironment)).toEqual(publicEnvironment);
  });

  it("aceita variáveis externas e não as devolve", () => {
    expect(parseSupabasePublicEnvironment({
      ...publicEnvironment,
      NODE_ENV: "test",
      CI: "true",
      VARIAVEL_SINTETICA: "valor_externo",
    })).toEqual(publicEnvironment);
  });

  it("rejeita secret key definida sem expor valores do ambiente", () => {
    const secret = "secret_sintetica_que_nao_pode_vazar";
    try {
      parseSupabasePublicEnvironment({ ...publicEnvironment, SUPABASE_SECRET_KEY: secret });
      expect.fail("o parser deveria rejeitar SUPABASE_SECRET_KEY");
    } catch (error) {
      expect(error).toBeInstanceOf(SupabaseEnvironmentError);
      expect(String(error)).toContain("SUPABASE_SECRET_KEY não é permitida no contrato público");
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain(projectRef);
      expect(String(error)).not.toContain(publicEnvironment.SUPABASE_PROJECT_URL);
      expect(String(error)).not.toContain(publicEnvironment.SUPABASE_PUBLISHABLE_KEY);
    }
  });

  it("rejeita secret key como string vazia", () => {
    expect(() => parseSupabasePublicEnvironment({
      ...publicEnvironment,
      SUPABASE_SECRET_KEY: "",
    })).toThrow(/SUPABASE_SECRET_KEY não é permitida no contrato público/);
  });

  it("preserva validações de HTTPS e correspondência do host", () => {
    expect(() => parseSupabasePublicEnvironment({ ...publicEnvironment, SUPABASE_PROJECT_URL: `http://${projectRef}.supabase.co` })).toThrow(/HTTPS/);
    expect(() => parseSupabasePublicEnvironment({ ...publicEnvironment, SUPABASE_PROJECT_URL: `https://${projectRef}.example.test` })).toThrow(/não corresponde/);
  });
});

describe("contrato secreto do servidor", () => {
  it("aceita uma secret key válida em módulo server-only", async () => {
    const source = readFileSync("src/config/supabase_server_environment.ts", "utf8");
    expect(source).toContain('import "server-only"');

    const { parseSupabaseServerEnvironment } = await import("@/config/supabase_server_environment");
    expect(parseSupabaseServerEnvironment({
      SUPABASE_PROJECT_REF: projectRef,
      SUPABASE_PROJECT_URL: `https://${projectRef}.supabase.co`,
      SUPABASE_SECRET_KEY: "secret_server_test_value",
    })).toMatchObject({ SUPABASE_SECRET_KEY: "secret_server_test_value" });
  });

  it("recusa secret key vazia sem expor seu valor", async () => {
    const { parseSupabaseServerEnvironment } = await import("@/config/supabase_server_environment");
    expect(() => parseSupabaseServerEnvironment({
      SUPABASE_PROJECT_REF: projectRef,
      SUPABASE_PROJECT_URL: `https://${projectRef}.supabase.co`,
      SUPABASE_SECRET_KEY: "   ",
    })).toThrow(SupabaseEnvironmentError);
  });
});

describe("contrato de migration do Supabase", () => {
  it("aprova negociação TLS no modo require sem alegar verificação de identidade", () => {
    expect(interpretRequireModeTlsHandshake(0, [
      "CONNECTION ESTABLISHED",
      "Protocol version: TLSv1.3",
      "Ciphersuite: TLS_AES_256_GCM_SHA384",
    ].join("\n"))).toEqual({
      endpointTlsNegotiated: true,
      protocolIdentified: true,
      cipherIdentified: true,
      certificateIdentityVerified: false,
      certificateIdentityVerificationReason: "not_performed_in_require_mode",
    });
  });

  it("recusa handshake sem protocolo ou sem cipher", () => {
    const withoutProtocol = interpretRequireModeTlsHandshake(0, "CONNECTION ESTABLISHED\nCiphersuite: sintético");
    const withoutCipher = interpretRequireModeTlsHandshake(0, "CONNECTION ESTABLISHED\nProtocol version: TLSv1.3");
    expect(withoutProtocol.endpointTlsNegotiated).toBe(false);
    expect(withoutProtocol.protocolIdentified).toBe(false);
    expect(withoutCipher.endpointTlsNegotiated).toBe(false);
    expect(withoutCipher.cipherIdentified).toBe(false);
  });

  it("não confunde falha de cadeia com falha de negociação no modo require", () => {
    const result = interpretRequireModeTlsHandshake(0, [
      "CONNECTION ESTABLISHED",
      "Protocol version: TLSv1.3",
      "Ciphersuite: TLS_AES_256_GCM_SHA384",
      "Verification error: cadeia sintética não verificada",
    ].join("\n"));
    expect(result.endpointTlsNegotiated).toBe(true);
    expect(result.certificateIdentityVerified).toBe(false);
    expect(result.certificateIdentityVerificationReason).toBe("not_performed_in_require_mode");
  });

  it("trata pg_stat_ssl do Session pooler como observação não conclusiva", () => {
    expect(interpretBackendSslObservation("aws-0-sa-east-1.pooler.supabase.com", false)).toEqual({
      observed: false,
      scope: "session_pooler_backend",
      conclusiveForClientTls: false,
    });
  });

  it("não confunde uma conexão direta com o Session pooler", () => {
    expect(interpretBackendSslObservation(`db.${projectRef}.supabase.co`, false)).toEqual({
      observed: false,
      scope: "direct_backend",
      conclusiveForClientTls: true,
    });
  });

  it("transforma a URL validada em credenciais mínimas com SSL explícito", () => {
    const encodedEnvironment = {
      ...migrationEnvironment,
      SUPABASE_MIGRATION_DATABASE_URL: `postgresql://postgres.${projectRef}:senha%40sintetica%3Asegura@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require`,
    };
    const credentials = createSupabaseMigrationCredentials(parseSupabaseMigrationEnvironment(encodedEnvironment));

    expect(credentials).toEqual({
      host: "aws-0-sa-east-1.pooler.supabase.com",
      port: 5432,
      user: `postgres.${projectRef}`,
      password: "senha@sintetica:segura",
      database: "postgres",
      ssl: "require",
    });
    expect(Object.keys(credentials).sort()).toEqual(["database", "host", "password", "port", "ssl", "user"]);
  });

  it.each(["false", "allow", "prefer", "disable"])('recusa sslmode="%s"', (sslmode) => {
    expect(() => parseSupabaseMigrationEnvironment({
      ...migrationEnvironment,
      SUPABASE_MIGRATION_DATABASE_URL: migrationEnvironment.SUPABASE_MIGRATION_DATABASE_URL.replace("sslmode=require", `sslmode=${sslmode}`),
    })).toThrow(/SSL/);
  });

  it("não expõe senha ou URL ao falhar na transformação", () => {
    const secret = "senha_sintetica_que_nao_pode_vazar";
    const invalidEnvironment = {
      ...migrationEnvironment,
      SUPABASE_MIGRATION_DATABASE_URL: `postgresql://postgres.${projectRef}:${secret}%ZZ@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require`,
    };

    try {
      createSupabaseMigrationCredentials(invalidEnvironment);
      expect.fail("a transformação deveria falhar");
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain("postgresql://");
      expect(String(error)).toContain("não foi possível preparar credenciais");
    }
  });

  it("aceita configuração sem publishable key", () => {
    expect(parseSupabaseMigrationEnvironment(migrationEnvironment)).toEqual(migrationEnvironment);
  });

  it("aceita configuração sem secret key", () => {
    expect(parseSupabaseMigrationEnvironment(migrationEnvironment)).toEqual(migrationEnvironment);
  });

  it.each([
    ["SUPABASE_PROJECT_REF", "project ref"],
    ["SUPABASE_MIGRATION_DATABASE_URL", "URL PostgreSQL"],
    ["SUPABASE_REMOTE_MIGRATION_CONFIRMATION", "confirmação"],
  ])("recusa ausência de %s (%s)", (field) => {
    expect(() => parseSupabaseMigrationEnvironment({ ...migrationEnvironment, [field]: undefined })).toThrow(SupabaseEnvironmentError);
  });

  it("recusa project ref inválido", () => {
    expect(() => parseSupabaseMigrationEnvironment({ ...migrationEnvironment, SUPABASE_PROJECT_REF: "ref-invalido" })).toThrow(SupabaseEnvironmentError);
  });

  it("recusa conexão local e conexão direta", () => {
    expect(() => parseSupabaseMigrationEnvironment({ ...migrationEnvironment, SUPABASE_MIGRATION_DATABASE_URL: `postgresql://postgres.${projectRef}:test@localhost:5432/postgres?sslmode=require` })).toThrow(/locais/);
    expect(() => parseSupabaseMigrationEnvironment({ ...migrationEnvironment, SUPABASE_MIGRATION_DATABASE_URL: `postgresql://postgres.${projectRef}:test@db.${projectRef}.supabase.co:5432/postgres?sslmode=require` })).toThrow(/direta/);
  });

  it("preserva validações de protocolo, pooler, porta, banco, usuário e SSL", () => {
    const parseUrl = (url: string) => () => parseSupabaseMigrationEnvironment({ ...migrationEnvironment, SUPABASE_MIGRATION_DATABASE_URL: url });
    expect(parseUrl(migrationEnvironment.SUPABASE_MIGRATION_DATABASE_URL.replace("postgresql:", "https:"))).toThrow(/PostgreSQL/);
    expect(parseUrl(migrationEnvironment.SUPABASE_MIGRATION_DATABASE_URL.replace("aws-0-sa-east-1.pooler.supabase.com", "database.example.test"))).toThrow(/Session pooler/);
    expect(parseUrl(migrationEnvironment.SUPABASE_MIGRATION_DATABASE_URL.replace(":5432/", ":6543/"))).toThrow(/Transaction pooler/);
    expect(parseUrl(migrationEnvironment.SUPABASE_MIGRATION_DATABASE_URL.replace(":5432/", ":5440/"))).toThrow(/porta 5432/);
    expect(parseUrl(migrationEnvironment.SUPABASE_MIGRATION_DATABASE_URL.replace("/postgres?", "/outro?"))).toThrow(/deve ser postgres/);
    expect(parseUrl(migrationEnvironment.SUPABASE_MIGRATION_DATABASE_URL.replace(`postgres.${projectRef}`, "postgres.outroprojectref000"))).toThrow(/usuário/);
    expect(parseUrl(migrationEnvironment.SUPABASE_MIGRATION_DATABASE_URL.replace("sslmode=require", "sslmode=disable"))).toThrow(/SSL/);
  });

  it("recusa confirmação remota divergente", () => {
    expect(() => parseSupabaseMigrationEnvironment({ ...migrationEnvironment, SUPABASE_REMOTE_MIGRATION_CONFIRMATION: "locacao_carros:outro" })).toThrow(/confirmação/);
  });

  it("não inclui chaves, senha ou URLs em mensagens de erro", () => {
    const secret = "valor_secreto_que_nao_pode_vazar";
    const input = {
      ...migrationEnvironment,
      SUPABASE_PUBLISHABLE_KEY: secret,
      SUPABASE_SECRET_KEY: secret,
      SUPABASE_MIGRATION_DATABASE_URL: `postgresql://user:${secret}@remote.example.test:6543/postgres`,
    };
    try {
      parseSupabaseMigrationEnvironment(input);
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain("postgresql://");
      expect(String(error)).not.toContain("remote.example.test");
    }
  });

  it("drizzle.supabase.config.ts utiliza somente o parser de migration", () => {
    const source = readFileSync("drizzle.supabase.config.ts", "utf8");
    expect(source).toContain("parseSupabaseMigrationEnvironment");
    expect(source).toContain("createSupabaseMigrationCredentials");
    expect(source).toContain("dbCredentials: credentials");
    expect(source).not.toContain("dbCredentials: { url");
    expect(source).not.toContain("parseSupabasePublicEnvironment");
    expect(source).not.toContain("parseSupabaseServerEnvironment");
    expect(source).not.toContain("SUPABASE_PUBLISHABLE_KEY");
    expect(source).not.toContain("SUPABASE_SECRET_KEY");
  });

  it("o diagnóstico remoto contém somente consultas SELECT", () => {
    const source = readFileSync("scripts/check_supabase_connection.ts", "utf8");
    const environmentSource = readFileSync("src/config/supabase_environment.ts", "utf8");
    expect(source).toContain("createSupabaseMigrationCredentials");
    expect(environmentSource).toContain('ssl: "require"');
    expect(source).toContain("max: 1");
    expect(source).toContain("prepare: false");
    expect(source).toContain("timeoutMs = 8_000");
    expect(source).toContain('"-servername", host');
    expect(source).not.toContain("-verify_hostname");
    expect(source).not.toContain("-verify_return_error");
    expect(source).toContain("backendSslObservation");
    expect(source).toContain('certificateIdentityVerificationReason: "not_performed_in_require_mode"');
    expect(source).not.toContain("SUPABASE_MIGRATION_DATABASE_URL");
    expect(source).not.toMatch(/\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE)\b/i);
  });
});
