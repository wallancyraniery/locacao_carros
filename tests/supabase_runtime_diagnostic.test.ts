import { describe, expect, it } from "vitest";
import {
  expectedRuntimeMembership,
  expectedRuntimeColumnPrivileges,
  hasExactRuntimeMemberships,
  runtimeDiagnosticErrorCode,
  safeRuntimeDiagnosticError,
} from "@/config/supabase_runtime_diagnostic";

describe("diagnóstico Supabase do runtime", () => {
  it("aceita somente a exceção administrativa comprovada", () => {
    expect(hasExactRuntimeMemberships([{ ...expectedRuntimeMembership }])).toBe(true);
    expect(hasExactRuntimeMemberships([])).toBe(false);
    expect(hasExactRuntimeMemberships([{ ...expectedRuntimeMembership, setOption: true }])).toBe(false);
    expect(hasExactRuntimeMemberships([
      { ...expectedRuntimeMembership },
      { ...expectedRuntimeMembership, member: "outra_role" },
    ])).toBe(false);
  });

  it("mantém exatamente os 18 grants por coluna", () => {
    expect(expectedRuntimeColumnPrivileges.size).toBe(18);
    expect(expectedRuntimeColumnPrivileges.has("rental_leads:id:SELECT")).toBe(false);
  });

  it("remove detalhes sensíveis dos erros", () => {
    const secret = "senha_que_nao_pode_aparecer";
    const error = Object.assign(new Error(`postgresql://runtime:${secret}@host`), { code: "28P01" });
    const safe = safeRuntimeDiagnosticError(error);
    expect(runtimeDiagnosticErrorCode(error)).toBe("28P01");
    expect(safe.message).toContain("autenticação");
    expect(safe.message).not.toContain(secret);
    expect(safe.message).not.toContain("postgresql://");
  });
});
