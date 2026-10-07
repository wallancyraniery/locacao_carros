import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localTurnstileToken } from "@/modules/leads/domain/turnstile_contract";

const getTurnstileEnvironment = vi.hoisted(() => vi.fn());
vi.mock("@/config/turnstile_environment.server", () => ({ getTurnstileEnvironment }));
vi.mock("server-only", () => ({}));

import { turnstileSubmissionProtection } from "@/modules/leads/infrastructure/turnstile_submission_protection.server";

const idempotencyKey = "50000000-0000-4000-8000-000000000001";
const operationId = "40000000-0000-4000-8000-000000000001";

describe("verificação Turnstile server-side", () => {
  beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it.each([
    [false, "invalid-input-response", "locadora.example.test", "submit_lead", false],
    [false, "timeout-or-duplicate", "locadora.example.test", "submit_lead", false],
    [true, null, "outro.example.test", "submit_lead", false],
    [true, null, "locadora.example.test", "other_action", false],
    [true, null, "locadora.example.test", "submit_lead", true],
  ])("diagnostica rejeição segura: %s %s %s %s", async (success, code, hostname, action, accepted) => {
    getTurnstileEnvironment.mockReturnValue({ mode: "cloudflare", siteKey: "public-site-key", secretKey: "private-secret", expectedHostname: "locadora.example.test" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      success, hostname, action, "error-codes": code ? [code] : [],
      token: "private-token", secret: "private-secret", fullName: "Private Person", phone: "11999990000",
    }) }));
    expect(await turnstileSubmissionProtection.verify({ token: "private-token", operationId, idempotencyKey })).toBe(accepted);
    if (accepted) expect(console.warn).not.toHaveBeenCalled();
    else {
      expect(console.warn).toHaveBeenCalledExactlyOnceWith({
        event: "lead_turnstile_rejected", siteverifySuccess: success,
        errorCodes: code ? [code] : [], hostnameMatches: hostname === "locadora.example.test",
        actionMatches: action === "submit_lead", responseHostname: hostname, responseAction: action,
      });
      const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
      for (const privateValue of ["private-token", "private-secret", "public-site-key", operationId, idempotencyKey, "Private Person", "11999990000"]) {
        expect(logged).not.toContain(privateValue);
      }
    }
  });

  it.each([null, [], "invalid-input-response", { arbitrary: true }])("recusa payload inesperado sem ecoar resposta: %j", async (payload) => {
    getTurnstileEnvironment.mockReturnValue({ mode: "cloudflare", siteKey: "site", secretKey: "secret", expectedHostname: "locadora.example.test" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    expect(await turnstileSubmissionProtection.verify({ token: "token", operationId, idempotencyKey })).toBe(false);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith({ event: "lead_turnstile_rejected", siteverifySuccess: false, errorCodes: [], hostnameMatches: false, actionMatches: false, responseHostname: null, responseAction: null });
  });

  it.each([
    ["invalid-input-response", []],
    [["invalid-input-response", 123, null, {}, "private-token", "private-secret", "x".repeat(65), "bad-request\n"], ["invalid-input-response"]],
    [Array(20).fill("timeout-or-duplicate"), Array(10).fill("timeout-or-duplicate")],
    [null, []],
  ])("limita e filtra error-codes: %j", async (codes, expected) => {
    getTurnstileEnvironment.mockReturnValue({ mode: "cloudflare", siteKey: "site", secretKey: "private-secret", expectedHostname: "locadora.example.test" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false, hostname: "private-secret", action: "private-token", "error-codes": codes }) }));
    expect(await turnstileSubmissionProtection.verify({ token: "private-token", operationId, idempotencyKey })).toBe(false);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith({ event: "lead_turnstile_rejected", siteverifySuccess: false, errorCodes: expected, hostnameMatches: false, actionMatches: false, responseHostname: null, responseAction: null });
  });

  it("valida o token sintético local sem rede", async () => {
    getTurnstileEnvironment.mockReturnValue({ mode: "local" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(turnstileSubmissionProtection.verify({ token: localTurnstileToken, operationId, idempotencyKey })).resolves.toBe(true);
    await expect(turnstileSubmissionProtection.verify({ token: "outro", operationId, idempotencyKey })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envia secret e token ao Siteverify no servidor e valida o hostname", async () => {
    getTurnstileEnvironment.mockReturnValue({ mode: "cloudflare", siteKey: "site", secretKey: "secret", expectedHostname: "locadora.example.test" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, hostname: "locadora.example.test", action: "submit_lead" }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(turnstileSubmissionProtection.verify({ token: "token", operationId, idempotencyKey })).resolves.toBe(true);
    const [, request] = fetchMock.mock.calls[0];
    expect(request.body).toBeInstanceOf(URLSearchParams);
    expect(request.body.get("secret")).toBe("secret");
    expect(request.body.get("response")).toBe("token");
    expect(request.body.get("idempotency_key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(request.body.get("idempotency_key")).not.toBe(idempotencyKey);
  });

  it("reproduz token single-use e retry seguro pelo mesmo idempotency_key", async () => {
    getTurnstileEnvironment.mockReturnValue({ mode: "cloudflare", siteKey: "site", secretKey: "secret", expectedHostname: "locadora.example.test" });
    const consumedTokens = new Set<string>();
    const resultsByIdempotencyKey = new Map<string, { success: boolean; hostname?: string; action?: string }>();
    const fetchMock = vi.fn(async (_url: string, request: { body: URLSearchParams }) => {
      const token = request.body.get("response")!;
      const key = request.body.get("idempotency_key")!;
      let result = resultsByIdempotencyKey.get(key);
      if (!result) {
        result = consumedTokens.has(token)
          ? { success: false }
          : { success: true, hostname: "locadora.example.test", action: "submit_lead" };
        consumedTokens.add(token);
        resultsByIdempotencyKey.set(key, result);
      }
      return { ok: true, json: async () => result };
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(turnstileSubmissionProtection.verify({ token: "single-use-token", operationId, idempotencyKey })).resolves.toBe(true);
    await expect(turnstileSubmissionProtection.verify({ token: "single-use-token", operationId, idempotencyKey })).resolves.toBe(true);
    await expect(turnstileSubmissionProtection.verify({
      token: "single-use-token",
      operationId: "40000000-0000-4000-8000-000000000002",
      idempotencyKey,
    })).resolves.toBe(false);
    await expect(turnstileSubmissionProtection.verify({
      token: "fresh-token",
      operationId,
      idempotencyKey: "50000000-0000-4000-8000-000000000003",
    })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const sentKeys = fetchMock.mock.calls.map(([, request]) => request.body.get("idempotency_key"));
    expect(sentKeys[1]).toBe(sentKeys[0]);
    expect(sentKeys[2]).not.toBe(sentKeys[0]);
    expect(sentKeys[3]).not.toBe(sentKeys[0]);
  });

  it("recusa resposta inválida ou hostname divergente", async () => {
    getTurnstileEnvironment.mockReturnValue({ mode: "cloudflare", siteKey: "site", secretKey: "secret", expectedHostname: "locadora.example.test" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, hostname: "outro.example.test", action: "submit_lead" }) }));
    await expect(turnstileSubmissionProtection.verify({ token: "token", operationId, idempotencyKey })).resolves.toBe(false);
  });

  it("encapsula indisponibilidade com estágio e código seguros", async () => {
    getTurnstileEnvironment.mockReturnValue({ mode: "cloudflare", siteKey: "site", secretKey: "secret", expectedHostname: "locadora.example.test" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(turnstileSubmissionProtection.verify({ token: "token-privado", operationId, idempotencyKey })).rejects.toMatchObject({
      diagnostic: { stage: "verify_turnstile", code: "TURNSTILE_UNAVAILABLE" },
    });
  });
});
