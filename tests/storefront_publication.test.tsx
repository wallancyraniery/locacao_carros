import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setStorefrontStatus } from "@/modules/storefront/actions";
import { PublicationForm } from "@/modules/storefront/publication_form";
import Organization from "@/app/admin/locadora/page";
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/modules/central/access.server", () => ({ loadCentralContext: mocks.context, requireCentralContext: mocks.context }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/modules/admin/auth_actions", () => ({ logout: vi.fn() }));
const context = { status: "ready", role: "owner", organization: { name: "Locadora", slug: "locadora-a", storefront_status: "draft" }, client: { rpc: mocks.rpc } };
function form(status = "published") { const data = new FormData(); data.set("status", status); data.set("organization_id", "forged"); data.set("userId", "forged"); return data; }
beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue(context); mocks.rpc.mockImplementation(async (_name, args) => ({ data: args.p_status, error: null })); });
afterEach(cleanup);
it.each(["published", "draft"])("owner define %s sem enviar identidade ou organização do formulário", async (status) => {
  expect((await setStorefrontStatus({}, form(status))).message).toMatch(/Vitrine/);
  expect(mocks.rpc).toHaveBeenCalledWith("set_tenant_storefront_status", { p_status: status });
  expect(mocks.revalidate).toHaveBeenCalledWith("/locadoras/locadora-a");
  expect(mocks.revalidate).toHaveBeenCalledWith("/admin/locadora");
});
it.each([{ status: "anonymous" }, { status: "unassigned" }, { status: "error" }, { ...context, role: "member" }])("contexto não autorizado não publica", async (value) => {
  mocks.context.mockResolvedValue(value); expect((await setStorefrontStatus({}, form())).message).toMatch(/Não foi possível/); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("estado inválido não consulta a sessão ou o banco", async () => {
  await setStorefrontStatus({}, form("invalid")); expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(["error", "throw", "mismatch"])("falha %s não anuncia sucesso nem expõe detalhes", async (failure) => {
  const secret = "SQL token email@example.test";
  if (failure === "error") mocks.rpc.mockResolvedValue({ error: { message: secret } });
  if (failure === "throw") mocks.rpc.mockRejectedValue(new Error(secret));
  if (failure === "mismatch") mocks.rpc.mockResolvedValue({ data: "draft" });
  const log = vi.spyOn(console, "error");
  const result = await setStorefrontStatus({}, form());
  expect(result.message).toMatch(/Não foi possível/); expect(JSON.stringify(result)).not.toContain(secret); expect(log).not.toHaveBeenCalled(); log.mockRestore();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("draft mostra estado e ação owner-only sem link público", async () => {
  render(await Organization()); expect(screen.getByText("Não publicada")).toBeVisible();
  expect(screen.getByRole("button", { name: "Publicar vitrine" })).toBeVisible(); expect(screen.queryByRole("link", { name: "Ver página pública da locadora" })).toBeNull();
});
it("published mostra link e opção de despublicar", async () => {
  mocks.context.mockResolvedValue({ ...context, organization: { ...context.organization, storefront_status: "published" } });
  render(await Organization()); expect(screen.getByText("Publicada")).toBeVisible(); expect(screen.getByRole("button", { name: "Despublicar vitrine" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Ver página pública da locadora" })).toHaveAttribute("href", "/locadoras/locadora-a");
});
it("member visualiza estado mas não recebe ação de publicação", async () => {
  mocks.context.mockResolvedValue({ ...context, role: "member" }); render(await Organization());
  expect(screen.getByText("Não publicada")).toBeVisible(); expect(screen.queryByRole("button", { name: /vitrine/ })).toBeNull();
});
it("formulário envia estado desejado e exibe confirmação da operação", async () => {
  render(<PublicationForm status="draft" />);
  fireEvent.submit(screen.getByRole("button", { name: "Publicar vitrine" }).closest("form")!);
  expect(await screen.findByRole("status")).toHaveTextContent("Vitrine publicada.");
  expect(mocks.rpc).toHaveBeenCalledWith("set_tenant_storefront_status", { p_status: "published" });
});
