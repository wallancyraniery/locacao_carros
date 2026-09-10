import { describe, expect, it } from "vitest";
import { parseTurnstileEnvironment, TurnstileEnvironmentError } from "@/config/turnstile_environment";

describe("configuração Turnstile", () => {
  it("usa proteção sintética local fora de produção", () => {
    expect(parseTurnstileEnvironment({ NODE_ENV: "development" })).toEqual({ mode: "local" });
  });

  it("recusa modo local e configuração incompleta em produção", () => {
    expect(() => parseTurnstileEnvironment({ NODE_ENV: "production", TURNSTILE_MODE: "local" })).toThrow(TurnstileEnvironmentError);
    expect(() => parseTurnstileEnvironment({ NODE_ENV: "production", TURNSTILE_MODE: "cloudflare" })).toThrow(TurnstileEnvironmentError);
  });

  it("aceita configuração Cloudflare completa sem expor o secret em erros", () => {
    const parsed = parseTurnstileEnvironment({
      NODE_ENV: "production",
      TURNSTILE_MODE: "cloudflare",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site-key-sintetica",
      TURNSTILE_SECRET_KEY: "secret-sintetico",
      TURNSTILE_EXPECTED_HOSTNAME: "locadora.example.test",
    });
    expect(parsed).toEqual({
      mode: "cloudflare",
      siteKey: "site-key-sintetica",
      secretKey: "secret-sintetico",
      expectedHostname: "locadora.example.test",
    });
    try {
      parseTurnstileEnvironment({ NODE_ENV: "production", TURNSTILE_MODE: "cloudflare", TURNSTILE_SECRET_KEY: "secret-privado" });
    } catch (error) {
      expect(String(error)).not.toContain("secret-privado");
    }
  });

  it.each(["https://locadora.example.test", "locadora.example.test/path", "locadora.example.test:443"])("recusa hostname com protocolo, caminho ou porta: %s", (value) => {
    expect(() => parseTurnstileEnvironment({
      NODE_ENV: "production", TURNSTILE_MODE: "cloudflare",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret",
      TURNSTILE_EXPECTED_HOSTNAME: value,
    })).toThrow(TurnstileEnvironmentError);
  });
});
