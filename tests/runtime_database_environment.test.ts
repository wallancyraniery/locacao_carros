import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const postgresFactory = vi.hoisted(() => vi.fn(() => ({ end: vi.fn() })));
vi.mock("postgres", () => ({ default: postgresFactory }));

import {
  parseRuntimeDatabaseEnvironment,
  RuntimeDatabaseEnvironmentError,
  type SupabaseRuntimeDatabaseEnvironment,
} from "@/config/runtime_database_environment";
import { createRuntimeDatabaseClientConfiguration } from "@/modules/database/client.server";

const projectRef = "abcdefghijklmnopqrst";
const host = "aws-0-sa-east-1.pooler.supabase.com";
const syntheticPem = [
  "-----BEGIN CERTIFICATE-----",
  "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo1MjM0NTY3ODkwQUJDREVGR0hJSktM",
  "-----END CERTIFICATE-----",
].join("\n");
const encodedCa = Buffer.from(syntheticPem, "utf8").toString("base64");
const validSupabaseEnvironment = {
  NODE_ENV: "production",
  DATABASE_RUNTIME_PROVIDER: "supabase",
  SUPABASE_RUNTIME_PROJECT_REF: projectRef,
  SUPABASE_RUNTIME_DATABASE_URL: `postgresql://lead_intake_runtime.${projectRef}:runtime_password_test@${host}:6543/postgres?sslmode=verify-full`,
  SUPABASE_RUNTIME_SSL_CA_BASE64: encodedCa,
  SUPABASE_RUNTIME_CONFIRMATION: `locacao_carros:${projectRef}:lead_intake_runtime`,
};

describe("contrato do banco em runtime", () => {
  it("aceita provider local explícito sem variáveis Supabase", () => {
    expect(parseRuntimeDatabaseEnvironment({
      NODE_ENV: "development",
      DATABASE_RUNTIME_PROVIDER: "local",
      DATABASE_URL: "postgresql://local_test:local_test@127.0.0.1:5433/locacaocarros",
    })).toMatchObject({ provider: "local" });
  });

  it("assume local sem provider somente fora de produção", () => {
    expect(parseRuntimeDatabaseEnvironment({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://local_test:local_test@localhost:5433/locacaocarros_test",
    }).provider).toBe("local");
    expect(() => parseRuntimeDatabaseEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://local_test:local_test@localhost:5433/locacaocarros",
    })).toThrow(/DATABASE_RUNTIME_PROVIDER obrigatória/);
  });

  it("aceita Transaction pooler, região, role e verify-full", () => {
    const result = parseRuntimeDatabaseEnvironment(validSupabaseEnvironment);
    expect(result).toMatchObject({ provider: "supabase", projectRef });
    expect(result).not.toHaveProperty("SUPABASE_MIGRATION_DATABASE_URL");
  });

  it("recusa Session pooler e aceita somente a porta 6543", () => {
    expect(() => parseRuntimeDatabaseEnvironment({
      ...validSupabaseEnvironment,
      SUPABASE_RUNTIME_DATABASE_URL: validSupabaseEnvironment.SUPABASE_RUNTIME_DATABASE_URL.replace(":6543/", ":5432/"),
    })).toThrow(/Session pooler/);
  });

  it("recusa usuário postgres e project ref divergente", () => {
    expect(() => parseRuntimeDatabaseEnvironment({
      ...validSupabaseEnvironment,
      SUPABASE_RUNTIME_DATABASE_URL: validSupabaseEnvironment.SUPABASE_RUNTIME_DATABASE_URL.replace("lead_intake_runtime.", "postgres."),
    })).toThrow(/administrativa/);
    expect(() => parseRuntimeDatabaseEnvironment({
      ...validSupabaseEnvironment,
      SUPABASE_RUNTIME_DATABASE_URL: validSupabaseEnvironment.SUPABASE_RUNTIME_DATABASE_URL.replace(projectRef, "bcdefghijklmnopqrstu"),
    })).toThrow(/usuário de runtime/);
  });

  it("recusa ca-central-1 e aceita sa-east-1", () => {
    expect(() => parseRuntimeDatabaseEnvironment({
      ...validSupabaseEnvironment,
      SUPABASE_RUNTIME_DATABASE_URL: validSupabaseEnvironment.SUPABASE_RUNTIME_DATABASE_URL.replace("sa-east-1", "ca-central-1"),
    })).toThrow(/sa-east-1/);
    expect(parseRuntimeDatabaseEnvironment(validSupabaseEnvironment).provider).toBe("supabase");
  });

  it("recusa sslmode=require e aceita verify-full", () => {
    expect(() => parseRuntimeDatabaseEnvironment({
      ...validSupabaseEnvironment,
      SUPABASE_RUNTIME_DATABASE_URL: validSupabaseEnvironment.SUPABASE_RUNTIME_DATABASE_URL.replace("verify-full", "require"),
    })).toThrow(/verify-full/);
    expect(parseRuntimeDatabaseEnvironment(validSupabaseEnvironment).provider).toBe("supabase");
  });

  it("recusa CA ausente, inválida ou excessiva sem expor seu conteúdo", () => {
    const invalidCa = "conteudo_sintetico_confidencial";
    for (const ca of [undefined, invalidCa, "A".repeat(32_769)]) {
      try {
        parseRuntimeDatabaseEnvironment({ ...validSupabaseEnvironment, SUPABASE_RUNTIME_SSL_CA_BASE64: ca });
        expect.fail("a CA deveria ser recusada");
      } catch (error) {
        expect(error).toBeInstanceOf(RuntimeDatabaseEnvironmentError);
        expect(String(error)).not.toContain(invalidCa);
        expect(String(error)).not.toContain(projectRef);
      }
    }
  });

  it("recusa confirmação divergente sem revelar confirmação, URL ou senha", () => {
    const confirmation = "confirmacao_sintetica_confidencial";
    try {
      parseRuntimeDatabaseEnvironment({ ...validSupabaseEnvironment, SUPABASE_RUNTIME_CONFIRMATION: confirmation });
      expect.fail("a confirmação deveria ser recusada");
    } catch (error) {
      const message = String(error);
      expect(message).not.toContain(confirmation);
      expect(message).not.toContain(projectRef);
      expect(message).not.toContain("runtime_password_test");
      expect(message).not.toContain("postgresql://");
    }
  });

  it("não lê contratos de migration nem chaves de API", () => {
    const source = readFileSync("src/config/runtime_database_environment.ts", "utf8");
    expect(source).not.toContain("SUPABASE_MIGRATION_DATABASE_URL");
    expect(source).not.toContain("SUPABASE_SECRET_KEY");
    expect(source).not.toContain("SUPABASE_PUBLISHABLE_KEY");
    expect(source).not.toContain("NEXT_PUBLIC_");
  });
});

describe("configuração do cliente PostgreSQL de runtime", () => {
  beforeEach(() => postgresFactory.mockClear());

  it("não cria conexão durante import", () => {
    expect(postgresFactory).not.toHaveBeenCalled();
  });

  it("preserva as opções do cliente local", () => {
    expect(createRuntimeDatabaseClientConfiguration({
      provider: "local",
      databaseUrl: "postgresql://local_test:local_test@localhost:5433/locacaocarros",
    })).toEqual({
      url: "postgresql://local_test:local_test@localhost:5433/locacaocarros",
      options: { max: 5, idle_timeout: 20, connect_timeout: 10 },
    });
  });

  it("limita o runtime remoto e exige TLS com identidade", () => {
    const environment = parseRuntimeDatabaseEnvironment(validSupabaseEnvironment) as SupabaseRuntimeDatabaseEnvironment;
    const configuration = createRuntimeDatabaseClientConfiguration(environment, () => 0.5);
    expect(configuration.options).toMatchObject({
      max: 1,
      prepare: false,
      connect_timeout: 5,
      idle_timeout: 8,
      max_lifetime: 330,
      ssl: {
        ca: `${syntheticPem}\n`,
        rejectUnauthorized: true,
        servername: host,
      },
    });
  });

  it("mantém o max_lifetime limitado com jitter", () => {
    const environment = parseRuntimeDatabaseEnvironment(validSupabaseEnvironment) as SupabaseRuntimeDatabaseEnvironment;
    expect(createRuntimeDatabaseClientConfiguration(environment, () => 0).options.max_lifetime).toBe(300);
    expect(createRuntimeDatabaseClientConfiguration(environment, () => 0.999).options.max_lifetime).toBe(359);
  });

  it("preserva server-only, repository único, consultas limitadas e runtime Node", () => {
    const clientSource = readFileSync("src/modules/database/client.server.ts", "utf8");
    const loaderSource = readFileSync("src/config/runtime_database_environment.server.ts", "utf8");
    const repositorySource = readFileSync("src/modules/leads/infrastructure/drizzle_lead_repository.server.ts", "utf8");
    const actionSource = readFileSync("src/modules/leads/actions/submit_lead_action.ts", "utf8");
    const pageSource = readFileSync("src/app/interesse/page.tsx", "utf8");
    expect(clientSource).toContain('import "server-only"');
    expect(loaderSource).toContain('import "server-only"');
    expect(repositorySource).toContain("getDatabase()");
    expect(repositorySource.match(/\.limit\(1\)/g)).toHaveLength(1);
    expect(repositorySource).not.toMatch(/select\(\s*\)/);
    expect(actionSource).toContain("submitLead(drizzleLeadRepository");
    expect(pageSource).toContain('export const runtime = "nodejs"');
  });

  it("preserva a Server Action sem abrir conexão para envio ignorado", async () => {
    const { submitLeadAction } = await import("@/modules/leads/actions/submit_lead_action");
    const formData = new FormData();
    formData.set("website", "bot_sintetico");
    expect(await submitLeadAction({ status: "idle" }, formData)).toMatchObject({ status: "success" });
    expect(postgresFactory).not.toHaveBeenCalled();
  });
});
