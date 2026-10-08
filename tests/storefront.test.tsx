import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadStorefront } from "@/modules/storefront/queries.server";
import Page from "@/app/locadoras/[slug]/page";
import { HomePage } from "@/modules/marketing/components/home_page";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sign: vi.fn(), context: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/vehicle_media/queries.server", () => ({ signPublicMedia: mocks.sign }));
vi.mock("@/modules/storefront/client.server", () => ({ createStorefrontClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/modules/central/access.server", () => ({ loadCentralContext: mocks.context }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
const data = { slug: "locadora-a", name: "Locadora A", city: "Cidade A", vehicles: [{ id: "20000000-0000-4000-8000-000000000011", images: [], brand: "Marca", model: "Modelo", version: "Versão", year: 2024, color: "Prata", weekly_price_cents: 70050 }], hasNext: false };
const page = (slug = data.slug, query = {}) => Page({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(query) });
beforeEach(() => { vi.clearAllMocks(); mocks.sign.mockResolvedValue({ status: "ready", images: [] }); mocks.rpc.mockResolvedValue({ data, error: null }); mocks.context.mockResolvedValue({ status: "anonymous" }); });
afterEach(cleanup);
it("consulta somente slug e página e valida projeção pública", async () => {
  expect(await loadStorefront(data.slug)).toEqual({ status: "ready", storefront: data });
  expect(mocks.rpc).toHaveBeenCalledWith("lookup_tenant_storefront_media", { p_slug: data.slug, p_page: 1 });
});
it.each(["../admin", "x", "UPPER", "a?organization_id=other"])("slug inválido %s não consulta banco", async (slug) => {
  expect(await loadStorefront(slug)).toEqual({ status: "missing" }); expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(["slug inexistente", "vitrine draft", "vitrine despublicada"])("%s resulta no mesmo 404", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: null }); await expect(page()).rejects.toThrow("NOT_FOUND");
});
it("parâmetros inválidos não consultam nem viram primeira página silenciosamente", async () => {
  await expect(page(data.slug, { page: "-1" })).rejects.toThrow("NOT_FOUND"); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("renderiza frota real sem imagem, login ou condições inventadas", async () => {
  render(await page());
  expect(screen.getByRole("heading", { name: "Locadora A" })).toBeVisible();
  for (const text of ["Cidade A", "Marca Modelo", "Versão", "2024", "Prata", "Sem foto"]) expect(screen.getByText(text)).toBeVisible();
  expect(screen.getByText(/700,50/)).toBeVisible(); expect(screen.queryByRole("img")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull(); expect(screen.queryByText(/caução|entrada|documentação/i)).toBeNull();
  expect(screen.getByText(/No detalhe, você pode manifestar interesse/)).toBeVisible();
  expect(screen.getByRole("link", { name: /Explorar veículos/ })).toHaveAttribute("href", "#frota");
  expect(screen.queryByRole("link", { name: "Início" })).toBeNull();
  expect(screen.getByText("Frota")).toHaveAttribute("aria-current", "page");
  expect(screen.queryByRole("navigation", { name: "Pré-visualização da Central" })).toBeNull();
  expect(mocks.context).not.toHaveBeenCalled();
  expect(screen.queryByRole("link", { name: /interesse|solicitar|reservar/i })).toBeNull();
});
it("organização sem frota continua válida e não recebe veículos demo", async () => {
  mocks.rpc.mockResolvedValue({ data: { ...data, city: null, vehicles: [] }, error: null }); render(await page());
  expect(screen.getByText("Cidade não informada")).toBeVisible(); expect(screen.getByText(/Nenhum veículo/)).toBeVisible();
});
it("paginação permanece pública sem preview", async () => {
  mocks.rpc.mockResolvedValue({ data: { ...data, hasNext: true }, error: null }); render(await page(data.slug, { page: "2" }));
  expect(screen.getByRole("link", { name: "Próxima" })).toHaveAttribute("href", "/locadoras/locadora-a?page=3");
});
it("preview sem sessão ou de outra locadora não revela a Central", async () => {
  render(await page(data.slug, { preview: "central" }));
  expect(screen.queryByRole("navigation", { name: "Pré-visualização da Central" })).toBeNull();
  expect(screen.getByRole("link", { name: /Ver detalhes/ })).toHaveAttribute("href", `/locadoras/${data.slug}/veiculos/${data.vehicles[0].id}`);
  mocks.context.mockResolvedValue({ status: "ready", organization: { slug: "outra-locadora" } });
  render(await page(data.slug, { preview: "central" }));
  expect(screen.queryByRole("navigation", { name: "Pré-visualização da Central" })).toBeNull();
});
it("preview da própria locadora mostra a navegação administrativa e preserva contexto", async () => {
  mocks.context.mockResolvedValue({ status: "ready", organization: { slug: data.slug } });
  mocks.rpc.mockResolvedValue({ data: { ...data, hasNext: true }, error: null });
  render(await page(data.slug, { page: "2", preview: "central" }));
  for (const [name, href] of [["Visão geral", "/admin"], ["Veículos", "/admin/veiculos"], ["Reservas", "/admin/reservas"], ["Interessados", "/admin/interessados"], ["Minha locadora", "/admin/locadora"]]) expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  expect(screen.getByRole("link", { name: /Ver detalhes/ })).toHaveAttribute("href", `/locadoras/${data.slug}/veiculos/${data.vehicles[0].id}?preview=central`);
  expect(screen.getByRole("link", { name: "Próxima" })).toHaveAttribute("href", `/locadoras/${data.slug}?page=3&preview=central`);
});
it.each(["provider", "throw", "private", "tenant"])("falha %s não expõe detalhes ou outra locadora", async (failure) => {
  const secret = "SQL token senha pessoa@example.test";
  if (failure === "provider") mocks.rpc.mockResolvedValue({ data, error: { message: secret } });
  if (failure === "throw") mocks.rpc.mockRejectedValue(new Error(secret));
  if (failure === "private") mocks.rpc.mockResolvedValue({ data: { ...data, data_controller: secret } });
  if (failure === "tenant") mocks.rpc.mockResolvedValue({ data: { ...data, slug: "locadora-b" } });
  const log = vi.spyOn(console, "error"); render(await page());
  expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível consultar");
  expect(document.body.textContent).not.toContain(secret); expect(screen.queryByText("Locadora A")).toBeNull(); expect(log).not.toHaveBeenCalled(); log.mockRestore();
});
it("home separa jornadas sem exigir conta de locatário ou inventar descoberta", () => {
  render(<HomePage vehicles={[]} />);
  expect(screen.getByRole("link", { name: "Sou locadora" })).toHaveAttribute("href", "/admin/login");
  expect(screen.getByRole("link", { name: "Quero alugar" })).toHaveAttribute("href", "#alugar");
  expect(screen.getByText(/A busca entre várias locadoras ainda não/)).toBeVisible();
  expect(screen.getByText(/Nas vitrines publicadas, você pode consultar a frota e manifestar interesse/)).toBeVisible();
  expect(screen.getByText(/a gestão de reservas ainda não está disponível/)).toBeVisible();
});
