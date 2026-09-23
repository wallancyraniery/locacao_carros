import { describe, expect, it, vi } from "vitest";
import { signupConfirmationUrl } from "@/config/signup_confirmation.server";

vi.mock("server-only", () => ({}));

describe("origem canônica da confirmação de signup", () => {
  it.each([
    ["production", "https://locacao-carros.vercel.app", "https://locacao-carros.vercel.app/admin/confirmar"],
    ["production", "https://locacao-carros.vercel.app/", "https://locacao-carros.vercel.app/admin/confirmar"],
    ["development", "http://localhost:3000", "http://localhost:3000/admin/confirmar"],
  ])("gera callback fixo em %s para %s", (NODE_ENV, APP_PUBLIC_ORIGIN, expected) => {
    expect(signupConfirmationUrl({ NODE_ENV, APP_PUBLIC_ORIGIN })).toBe(expected);
  });
  it.each([
    undefined, "", "invalid", "//example.test", "javascript:alert(1)", "http://example.test",
    "https://user:private-token@example.test", "https://example.test/path", "https://example.test?token=private-token",
    "https://example.test#private-token", " https://example.test", "https://example.test/../",
  ])("recusa configuração inválida sem expor seu conteúdo (%s)", (APP_PUBLIC_ORIGIN) => {
    expect(() => signupConfirmationUrl({ APP_PUBLIC_ORIGIN, NODE_ENV: "development" }))
      .toThrow("Configuração de confirmação indisponível.");
  });
  it.each(["http://localhost:3000", "https://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"])("recusa loopback em produção (%s)", (APP_PUBLIC_ORIGIN) => {
    expect(() => signupConfirmationUrl({ APP_PUBLIC_ORIGIN, NODE_ENV: "production" })).toThrow("Configuração de confirmação indisponível.");
  });
  it("não infere origem de headers, preview ou URL do Supabase", () => {
    expect(() => signupConfirmationUrl({ HOST: "evil.test", HTTP_HOST: "evil.test", HTTP_X_FORWARDED_HOST: "evil.test",
      VERCEL_URL: "preview.example.test", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" }))
      .toThrow("Configuração de confirmação indisponível.");
  });
});
