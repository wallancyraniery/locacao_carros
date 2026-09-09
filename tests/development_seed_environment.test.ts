import { describe, expect, it } from "vitest";
import { parseDevelopmentSeedEnvironment } from "../scripts/development_seed_environment.mjs";

const localEnvironment = {
  DATABASE_URL: "postgresql://local_user:local_password@127.0.0.1:5433/locadora_test",
  POSTGRES_DB: "locadora_test",
};

function rejectionMessage(environment: Record<string, string | undefined>) {
  try {
    parseDevelopmentSeedEnvironment(environment);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return null;
}

describe("ambiente do seed de desenvolvimento", () => {
  it("aceita somente URL PostgreSQL local para o banco declarado", () => {
    expect(parseDevelopmentSeedEnvironment(localEnvironment)).toEqual({ databaseUrl: localEnvironment.DATABASE_URL });
  });

  it.each([
    [{ POSTGRES_DB: "locadora_test" }, "INCOMPLETE"],
    [{ DATABASE_URL: localEnvironment.DATABASE_URL }, "INCOMPLETE"],
    [{ ...localEnvironment, DATABASE_URL: "valor-invalido" }, "INVALID_URL"],
    [{ ...localEnvironment, DATABASE_URL: "https://127.0.0.1/locadora_test" }, "INVALID_PROTOCOL"],
    [{ ...localEnvironment, DATABASE_URL: "postgresql://local_user:local_password@db.example.test/locadora_test" }, "REMOTE_HOST"],
    [{ ...localEnvironment, POSTGRES_DB: "outro_banco" }, "DATABASE_MISMATCH"],
  ])("recusa configuração insegura antes de fornecer uma URL (%s)", (environment, code) => {
    expect(() => parseDevelopmentSeedEnvironment(environment)).toThrow(`Configuração do seed local recusada (${code}).`);
  });

  it("não inclui URL, senha ou conteúdo do ambiente na mensagem", () => {
    const marker = "segredo-sintetico-nao-expor";
    const environment = {
      DATABASE_URL: `postgresql://usuario:${marker}@db.example.test/locadora_test`,
      POSTGRES_DB: "locadora_test",
      PRIVATE_MARKER: marker,
    };
    const message = rejectionMessage(environment);

    expect(message).toBe("Configuração do seed local recusada (REMOTE_HOST).");
    expect(message).not.toContain(marker);
    expect(message).not.toContain("postgresql://");
    expect(message).not.toContain(JSON.stringify(environment));
  });
});
