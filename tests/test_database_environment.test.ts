import { describe, expect, it } from "vitest";
import {
  parseTestDatabaseEnvironment,
  TestDatabaseEnvironmentError,
} from "@/config/test_database_environment";

const validEnvironment = {
  DATABASE_URL: "postgresql://local_user:main_secret@127.0.0.1:5432/locacaocarros",
  MIGRATION_DATABASE_URL: "postgresql://migration_user:migration_secret@127.0.0.1:5432/locacaocarros",
  TEST_DATABASE_URL: "postgresql://test_user:test_secret@127.0.0.1:5432/locacaocarros_test",
};

describe("proteções do banco PostgreSQL de testes", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])("aceita o host local %s", (host) => {
    const environment = { ...validEnvironment, TEST_DATABASE_URL: `postgresql://test_user:test_secret@${host}:5432/locacaocarros_test` };
    expect(parseTestDatabaseEnvironment(environment).testDatabaseName).toBe("locacaocarros_test");
  });

  it("recusa TEST_DATABASE_URL ausente", () => {
    expect(() => parseTestDatabaseEnvironment({ ...validEnvironment, TEST_DATABASE_URL: undefined })).toThrow(TestDatabaseEnvironmentError);
  });

  it("recusa protocolo inválido", () => {
    expect(() => parseTestDatabaseEnvironment({ ...validEnvironment, TEST_DATABASE_URL: "https://localhost/locacaocarros_test" })).toThrow(TestDatabaseEnvironmentError);
  });

  it("recusa host remoto", () => {
    expect(() => parseTestDatabaseEnvironment({ ...validEnvironment, TEST_DATABASE_URL: "postgresql://user:secret@database.example/locacaocarros_test" })).toThrow(/host de testes deve ser local/);
  });

  it("recusa nome sem o sufixo de teste", () => {
    expect(() => parseTestDatabaseEnvironment({ ...validEnvironment, TEST_DATABASE_URL: "postgresql://user:secret@localhost/locacaocarros" })).toThrow(/terminar em _test/);
  });

  it("recusa o mesmo nome do banco da aplicação", () => {
    expect(() => parseTestDatabaseEnvironment({
      ...validEnvironment,
      DATABASE_URL: "postgresql://user:one@localhost/locacaocarros_test",
    })).toThrow(/diferente dos bancos principais/);
  });

  it("recusa o mesmo nome do banco de migrations", () => {
    expect(() => parseTestDatabaseEnvironment({
      ...validEnvironment,
      MIGRATION_DATABASE_URL: "postgresql://user:two@localhost/locacaocarros_test",
    })).toThrow(/diferente dos bancos principais/);
  });

  it.each(["DATABASE_URL", "MIGRATION_DATABASE_URL"])("recusa TEST_DATABASE_URL igual a %s", (field) => {
    expect(() => parseTestDatabaseEnvironment({
      ...validEnvironment,
      [field]: validEnvironment.TEST_DATABASE_URL,
    })).toThrow(TestDatabaseEnvironmentError);
  });

  it("não inclui senhas nem URLs completas nos erros", () => {
    const secret = "senha_que_nao_pode_vazar";
    try {
      parseTestDatabaseEnvironment({
        ...validEnvironment,
        TEST_DATABASE_URL: `postgresql://user:${secret}@remote.example/locacaocarros_test`,
      });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain("postgresql://");
      expect(String(error)).not.toContain("remote.example");
    }
  });
});
