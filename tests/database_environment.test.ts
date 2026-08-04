import { describe, expect, it } from "vitest";
import { DatabaseEnvironmentError, parseDatabaseEnvironment } from "@/config/database_environment";

const validEnvironment = {
  POSTGRES_DB: "locacaocarros",
  POSTGRES_USER: "local_user",
  POSTGRES_PASSWORD: "local_password",
  DATABASE_URL: "postgres://local_user:secret_value@127.0.0.1:5432/locacaocarros",
  MIGRATION_DATABASE_URL: "postgresql://local_user:secret_value@localhost:5432/locacaocarros",
};

describe("contrato de ambiente do banco", () => {
  it("aceita os protocolos postgres e postgresql", () => expect(parseDatabaseEnvironment(validEnvironment)).toMatchObject(validEnvironment));

  it.each(["DATABASE_URL", "MIGRATION_DATABASE_URL"])("rejeita %s ausente", (field) => {
    expect(() => parseDatabaseEnvironment({ ...validEnvironment, [field]: undefined })).toThrow(DatabaseEnvironmentError);
  });

  it("rejeita protocolo incorreto", () => {
    expect(() => parseDatabaseEnvironment({ ...validEnvironment, DATABASE_URL: "https://localhost/database" })).toThrow(DatabaseEnvironmentError);
  });

  it("rejeita URL malformada", () => {
    expect(() => parseDatabaseEnvironment({ ...validEnvironment, DATABASE_URL: "postgresql://[inválida" })).toThrow(DatabaseEnvironmentError);
  });

  it("rejeita valor vazio", () => {
    expect(() => parseDatabaseEnvironment({ ...validEnvironment, MIGRATION_DATABASE_URL: " " })).toThrow(DatabaseEnvironmentError);
  });

  it("não inclui senha ou URL em mensagens de erro", () => {
    const secret = "senha_que_nao_pode_vazar";
    try {
      parseDatabaseEnvironment({ ...validEnvironment, DATABASE_URL: `https://usuario:${secret}@host/banco` });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain("https://");
    }
  });
});
