import { describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
import {
  reportUnexpectedLeadSubmissionError,
  runWithLeadRepositoryDiagnostic,
  safeLeadRepositoryDiagnostic,
} from "@/modules/leads/infrastructure/lead_repository_diagnostic";

describe("diagnóstico seguro do repository de leads", () => {
  it.each([
    ["runtime_client_initialization", null],
    ["find_available_demo_vehicle", "08006"],
    ["create_lead", "42501"],
  ] as const)("identifica o estágio %s", async (stage, code) => {
    const failure = code ? Object.assign(new Error("valor privado"), { code }) : new Error("valor privado");
    let observed: unknown;
    try {
      await runWithLeadRepositoryDiagnostic(stage, () => Promise.reject(failure));
    } catch (error) {
      observed = error;
    }

    expect(safeLeadRepositoryDiagnostic(observed)).toEqual({ stage, code });
    expect(JSON.stringify(safeLeadRepositoryDiagnostic(observed))).not.toContain("valor privado");
  });

  it.each(["valor privado", "PESSOA_PRIVADA", "MARIA"])("recusa código arbitrário %s", async (code) => {
    let observed: unknown;
    try {
      await runWithLeadRepositoryDiagnostic("create_lead", () => {
        throw Object.assign(new Error("segredo"), { code });
      });
    } catch (error) {
      observed = error;
    }
    expect(safeLeadRepositoryDiagnostic(observed)).toEqual({ stage: "create_lead", code: null });
  });

  it("extrai SQLSTATE de DrizzleQueryError sem registrar query, parâmetros ou dados privados", async () => {
    const privateValues = ["Pessoa Sintética", "11999999999", "pessoa@example.test", "Cidade Sintética"];
    const postgresError = Object.assign(new Error(privateValues.join(" ")), {
      code: "42501", detail: privateValues[0], hint: privateValues[1],
    });
    const queryError = new DrizzleQueryError("insert into rental_leads values ($1, $2, $3, $4)", privateValues, postgresError);
    const wrappedError = new Error("wrapper privado", { cause: queryError });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await runWithLeadRepositoryDiagnostic("create_lead", () => Promise.reject(wrappedError));
    } catch (error) {
      reportUnexpectedLeadSubmissionError(error);
    }
    expect(consoleError).toHaveBeenCalledExactlyOnceWith({ stage: "create_lead", code: "42501" });
    const logged = JSON.stringify(consoleError.mock.calls);
    for (const value of [...privateValues, "insert into", "wrapper privado", "detail", "hint", "stack"]) {
      expect(logged).not.toContain(value);
    }
    consoleError.mockRestore();
  });

  it.each([
    "ERR_TLS_CERT_ALTNAME_INVALID", "ECONNREFUSED", "INVALID_RUNTIME_DATABASE_ENVIRONMENT",
    "CONNECT_TIMEOUT", "CONNECTION_CLOSED", "CONNECTION_ENDED", "CONNECTION_DESTROYED",
  ])("reconhece código de configuração, conexão ou TLS permitido: %s", (code) => {
    expect(safeLeadRepositoryDiagnostic({ cause: { code } }))
      .toEqual({ stage: "submit_lead", code });
  });

  it("encerra a inspeção de causas cíclicas ou excessivamente profundas", () => {
    const cycle: { cause?: unknown } = {};
    cycle.cause = cycle;
    expect(safeLeadRepositoryDiagnostic(cycle)).toEqual({ stage: "submit_lead", code: null });
    let deep: unknown = { code: "42501" };
    for (let depth = 0; depth < 8; depth += 1) deep = { cause: deep };
    expect(safeLeadRepositoryDiagnostic(deep)).toEqual({ stage: "submit_lead", code: null });
  });

  it("não registra nada por conta própria", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(runWithLeadRepositoryDiagnostic("find_available_demo_vehicle", () => 1)).resolves.toBe(1);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
