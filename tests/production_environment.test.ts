import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getProductionEnvironment = vi.hoisted(() => vi.fn());
vi.mock("@/config/production_environment.server", () => ({ getProductionEnvironment }));

import {
  parseProductionEnvironment,
  ProductionEnvironmentError,
} from "@/config/production_environment";
import { getRuntimeDatabaseEnvironment } from "@/config/runtime_database_environment.server";
import { getTurnstileEnvironment } from "@/config/turnstile_environment.server";

const projectRef = "abcdefghijklmnopqrst";
const syntheticPem = [
  "-----BEGIN CERTIFICATE-----",
  "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo1MjM0NTY3ODkwQUJDREVGR0hJSktM",
  "MA==",
  "-----END CERTIFICATE-----",
].join("\n");

const validProductionEnvironment = {
  NODE_ENV: "production",
  DATABASE_RUNTIME_PROVIDER: "supabase",
  SUPABASE_RUNTIME_PROJECT_REF: projectRef,
  SUPABASE_RUNTIME_DATABASE_URL: `postgresql://lead_intake_runtime.${projectRef}:runtime_password_test@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=verify-full`,
  SUPABASE_RUNTIME_SSL_CA_BASE64: Buffer.from(syntheticPem, "utf8").toString("base64"),
  SUPABASE_RUNTIME_CONFIRMATION: `locacao_carros:${projectRef}:lead_intake_runtime`,
  TURNSTILE_MODE: "cloudflare",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site-key-sintetica",
  TURNSTILE_SECRET_KEY: "turnstile-secret-sintetico",
  TURNSTILE_EXPECTED_HOSTNAME: "locadora.example.test",
  PRIVACY_CONTROLLER_NAME: "Locadora oficial sintética",
  PRIVACY_CONTACT_LABEL: "Canal oficial de privacidade",
  PRIVACY_CONTACT_URL: "mailto:privacidade@locadora.com.br",
};

describe("contrato local da configuração de produção", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("aceita conjuntamente runtime Supabase e Turnstile válidos sem rede", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = parseProductionEnvironment(validProductionEnvironment);

    expect(result.runtimeDatabase).toMatchObject({ provider: "supabase", projectRef });
    expect(result.turnstile).toMatchObject({
      mode: "cloudflare",
      expectedHostname: "locadora.example.test",
    });
    expect(result.privacyNotice).toMatchObject({ mode: "configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa provider local em produção", () => {
    expect(() => parseProductionEnvironment({
      ...validProductionEnvironment,
      DATABASE_RUNTIME_PROVIDER: "local",
      SUPABASE_RUNTIME_DATABASE_URL: undefined,
      DATABASE_URL: undefined,
    })).toThrow(ProductionEnvironmentError);
  });

  it.each([
    "DATABASE_URL",
    "MIGRATION_DATABASE_URL",
    "TEST_DATABASE_URL",
    "POSTGRES_PASSWORD",
    "SUPABASE_MIGRATION_DATABASE_URL",
    "SUPABASE_SECRET_KEY",
  ])("recusa credencial alheia ao runtime no processo da aplicação: %s", (field) => {
    const secret = "valor_sintetico_que_nao_pode_vazar";
    try {
      parseProductionEnvironment({ ...validProductionEnvironment, [field]: secret });
      expect.fail("a credencial alheia deveria ser recusada");
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionEnvironmentError);
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain("postgresql://");
    }
  });

  it.each([
    ["porta do Session Pooler", { SUPABASE_RUNTIME_DATABASE_URL: validProductionEnvironment.SUPABASE_RUNTIME_DATABASE_URL.replace(":6543/", ":5432/") }],
    ["TLS sem verificação de identidade", { SUPABASE_RUNTIME_DATABASE_URL: validProductionEnvironment.SUPABASE_RUNTIME_DATABASE_URL.replace("verify-full", "require") }],
    ["usuário administrativo", { SUPABASE_RUNTIME_DATABASE_URL: validProductionEnvironment.SUPABASE_RUNTIME_DATABASE_URL.replace("lead_intake_runtime.", "postgres.") }],
    ["CA inválida", { SUPABASE_RUNTIME_SSL_CA_BASE64: Buffer.from("conteudo-invalido", "utf8").toString("base64") }],
  ])("recusa runtime inseguro: %s", (_scenario, override) => {
    expect(() => parseProductionEnvironment({
      ...validProductionEnvironment,
      ...override,
    })).toThrow();
  });

  it.each([
    { TURNSTILE_MODE: "local" },
    { TURNSTILE_MODE: "cloudflare", TURNSTILE_SECRET_KEY: undefined },
    { TURNSTILE_MODE: "cloudflare", NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined },
    { TURNSTILE_MODE: "cloudflare", TURNSTILE_EXPECTED_HOSTNAME: "https://locadora.example.test" },
  ])("recusa Turnstile local ou incompleto em produção: %o", (override) => {
    expect(() => parseProductionEnvironment({
      ...validProductionEnvironment,
      ...override,
    })).toThrow();
  });

  it.each([
    { PRIVACY_CONTROLLER_NAME: undefined },
    { PRIVACY_CONTACT_LABEL: undefined },
    { PRIVACY_CONTACT_URL: undefined },
    { PRIVACY_CONTROLLER_NAME: "Controlador pendente" },
    { PRIVACY_CONTACT_URL: "https://example.com/privacidade" },
  ])("recusa privacidade incompleta ou fictícia em produção: %o", (override) => {
    expect(() => parseProductionEnvironment({
      ...validProductionEnvironment,
      ...override,
    })).toThrow();
  });

  it("não inclui secrets, URL autenticada ou certificado no erro", () => {
    const values = [
      "runtime_password_test",
      "turnstile-secret-sintetico",
      validProductionEnvironment.SUPABASE_RUNTIME_DATABASE_URL,
      validProductionEnvironment.SUPABASE_RUNTIME_SSL_CA_BASE64,
    ];
    try {
      parseProductionEnvironment({ ...validProductionEnvironment, DATABASE_URL: "credencial_administrativa_sintetica" });
      expect.fail("a configuração deveria ser recusada");
    } catch (error) {
      for (const value of values) expect(String(error)).not.toContain(value);
    }
  });

  it("mantém build e inicialização livres de migration e seed automáticos", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string | undefined>;
    };
    for (const name of ["prebuild", "build", "postbuild", "prestart", "start", "poststart"]) {
      expect(packageJson.scripts[name] ?? "").not.toMatch(/migrat|seed/i);
    }
    expect(packageJson.scripts.build).toBe("next build --webpack");
    expect(packageJson.scripts.start).toBe("next start");
  });

  it("é reutilizado pelos loaders antes do banco e do Turnstile em produção", () => {
    const parsed = parseProductionEnvironment(validProductionEnvironment);
    getProductionEnvironment.mockReturnValue(parsed);
    vi.stubEnv("NODE_ENV", "production");

    expect(getRuntimeDatabaseEnvironment()).toBe(parsed.runtimeDatabase);
    expect(getTurnstileEnvironment()).toBe(parsed.turnstile);
    expect(getProductionEnvironment).toHaveBeenCalledTimes(2);
  });
});
