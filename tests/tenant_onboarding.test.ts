import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { organizationInputSchema, signupSchema } from "@/modules/onboarding/validation";
import { signup } from "@/modules/admin/auth_actions";
import { loadOrganizationAccess } from "@/modules/onboarding/access.server";
import { createOrganization } from "@/modules/onboarding/actions";
import { GET } from "@/app/admin/confirmar/route";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ create: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }), revalidate: vi.fn() }));
vi.mock("@/modules/admin/supabase.server", () => ({ createAdminClient: mocks.create }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const orgId = "60000000-0000-4000-8000-000000000001";
const userId = "60000000-0000-4000-8000-000000000002";
const input = { operationId: "60000000-0000-4000-8000-000000000003", name: "Locadora Sintética", slug: "locadora-sintetica",
  city: "Cidade Sintética", dataController: "Controlador Sintético", privacyChannelLabel: "Privacidade", privacyChannelUrl: "https://example.test/privacidade" };
const credentials = { email: "test@example.test", password: "senha-sintetica-123", confirmPassword: "senha-sintetica-123" };
const secret = "SQL senha privada test@example.test 11999999999";
function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
function client() {
  const membership = { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
  return { membership, from: vi.fn(() => ({ select: vi.fn(() => membership) })), rpc: vi.fn().mockResolvedValue({ data: orgId, error: null }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: { id: userId }, session: null }, error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ data: { session: { access_token: "synthetic" } }, error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "synthetic" } }, error: null }) } };
}
let api: ReturnType<typeof client>;
beforeEach(() => { vi.clearAllMocks(); api = client(); mocks.create.mockResolvedValue(api); vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => { expect(console.error).not.toHaveBeenCalled(); vi.restoreAllMocks(); });

describe("cadastro e confirmação", () => {
  it.each([{ email: "bad" }, { password: "curta" }, { confirmPassword: "diferente" }, { password: "x".repeat(129) }])("valida credenciais %j antes de chamar Auth", async (overrides) => {
    expect(signupSchema.safeParse({ ...credentials, ...overrides }).success).toBe(false);
    expect(await signup({}, form({ ...credentials, ...overrides }))).toHaveProperty("message");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("usuário retornado sem sessão aguarda confirmação, sem fingir autenticação", async () => {
    const result = await signup({}, form(credentials));
    expect(result.message).toContain("Se o cadastro puder ser concluído");
    expect(api.auth.signUp).toHaveBeenCalledWith({ email: credentials.email, password: credentials.password });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(api.rpc).not.toHaveBeenCalled();
  });
  it("sessão real segue para o roteamento privado", async () => {
    api.auth.signUp.mockResolvedValue({ data: { user: { id: userId }, session: { access_token: "synthetic" } }, error: null } as never);
    await expect(signup({}, form(credentials))).rejects.toThrow("redirect:/admin");
  });
  it("conta existente, confirmação pendente e falha técnica têm resposta neutra idêntica", async () => {
    const pending = await signup({}, form(credentials));
    api.auth.signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: secret, code: "user_already_exists" } } as never);
    expect(await signup({}, form(credentials))).toEqual(pending);
    api.auth.signUp.mockRejectedValueOnce(new Error(secret));
    expect(await signup({}, form(credentials))).toEqual(pending);
    expect(JSON.stringify(pending)).not.toContain(credentials.email);
  });
  it("confirma token somente como signup e usa destino fixo", async () => {
    const response = await GET(new NextRequest("https://app.example.test/admin/confirmar?token_hash=synthetic&type=signup&next=https://evil.test"));
    expect(api.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "synthetic", type: "signup" });
    expect(response.headers.get("location")).toBe("https://app.example.test/admin");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("suporta retorno PKCE sem expor code no redirecionamento", async () => {
    const response = await GET(new NextRequest("https://app.example.test/admin/confirmar?code=synthetic"));
    expect(api.auth.exchangeCodeForSession).toHaveBeenCalledWith("synthetic");
    expect(response.headers.get("location")).toBe("https://app.example.test/admin");
  });
  it.each(["", "?token_hash=synthetic&type=recovery"])("recusa confirmação sem token ou tipo permitido: %s", async (query) => {
    expect((await GET(new NextRequest(`https://app.example.test/admin/confirmar${query}`))).headers.get("location")).toBe("https://app.example.test/admin/login?confirmation=failed");
    expect(api.auth.verifyOtp).not.toHaveBeenCalled();
  });
  it("confirmação falha não expõe resposta Auth nem declara sessão", async () => {
    api.auth.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: { message: secret } } as never);
    const response = await GET(new NextRequest("https://app.example.test/admin/confirmar?token_hash=synthetic&type=signup"));
    expect(response.headers.get("location")).toBe("https://app.example.test/admin/login?confirmation=failed");
    expect(await response.text()).not.toContain(secret);
  });
});

describe("autorização e criação", () => {
  it("identidade sem organização é unassigned; associada é ready", async () => {
    expect(await loadOrganizationAccess()).toEqual({ status: "unassigned" });
    api.membership.maybeSingle.mockResolvedValueOnce({ data: { organization_id: orgId }, error: null } as never);
    expect(await loadOrganizationAccess()).toEqual({ status: "ready", organizationId: orgId });
  });
  it.each([{ user: null }, { user: { id: userId, is_anonymous: true } }])("anônimo não consulta membership nem cria locadora", async (identity) => {
    api.auth.getUser.mockResolvedValue({ data: identity, error: null } as never);
    expect(await loadOrganizationAccess()).toEqual({ status: "anonymous" });
    expect((await createOrganization(input.operationId, {}, form(input))).message).toContain("Entre na sua conta");
    expect(api.from).not.toHaveBeenCalled(); expect(api.rpc).not.toHaveBeenCalled();
  });
  it("erro de membership não é tratado como ausência de organização", async () => {
    api.membership.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: secret } } as never);
    expect(await loadOrganizationAccess()).toEqual({ status: "error" });
  });
  it("não envia userId, role ou organização do formulário; retry mantém operação", async () => {
    const data = form({ ...input, userId: crypto.randomUUID(), role: "owner", organizationId: crypto.randomUUID(), operationId: crypto.randomUUID() });
    for (let i = 0; i < 2; i++) await expect(createOrganization(input.operationId, {}, data)).rejects.toThrow("redirect:/admin/pronto");
    expect(api.rpc).toHaveBeenCalledTimes(2);
    for (const args of api.rpc.mock.calls) expect(args).toEqual(["create_initial_organization", {
      p_operation_id: input.operationId, p_name: input.name, p_slug: input.slug, p_city: input.city,
      p_data_controller: input.dataController, p_privacy_channel_label: input.privacyChannelLabel, p_privacy_channel_url: input.privacyChannelUrl,
    }]);
  });
  it.each(["A BC", "ab", "locadora--nova", "x".repeat(64)])("slug inválido %s não chama RPC", async (slug) => {
    expect(organizationInputSchema.safeParse({ ...input, slug }).success).toBe(false);
    expect(await createOrganization(input.operationId, {}, form({ ...input, slug }))).toHaveProperty("message");
    expect(api.rpc).not.toHaveBeenCalled();
  });
  it.each(["javascript:alert(1)", "http://example.test", "https://user:password@example.test"])("canal inseguro %s não é aceito", (privacyChannelUrl) => {
    expect(organizationInputSchema.safeParse({ ...input, privacyChannelUrl }).success).toBe(false);
  });
  it.each([["P2002", "Esse endereço não está disponível"], ["P2003", "Sua conta já possui uma locadora"], ["42501", "Não foi possível criar"]])("mapeia %s sem detalhes privados", async (code, message) => {
    api.rpc.mockResolvedValueOnce({ data: null, error: { code, message: secret, details: secret } } as never);
    const result = await createOrganization(input.operationId, {}, form(input));
    expect(result.message).toContain(message);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("recusa recibo inesperado e exceção sem vazar SQL ou PII", async () => {
    api.rpc.mockResolvedValueOnce({ data: { secret }, error: null } as never);
    const result = await createOrganization(input.operationId, {}, form(input));
    api.rpc.mockRejectedValueOnce(new Error(secret));
    expect(await createOrganization(input.operationId, {}, form(input))).toEqual(result);
    expect(result.message).toBe("Não foi possível criar sua locadora agora. Tente novamente neste formulário.");
  });
});
