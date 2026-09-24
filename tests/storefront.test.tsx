import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadStorefront } from "@/modules/storefront/queries.server";
import Page from "@/app/locadoras/[slug]/page";
import { HomePage } from "@/modules/marketing/components/home_page";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/storefront/client.server", () => ({ createStorefrontClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
const data = { slug: "locadora-a", name: "Locadora A", city: "Cidade A", vehicles: [{ brand: "Marca", model: "Modelo", version: "Versão", year: 2024, color: "Prata", weekly_price_cents: 70050 }], hasNext: false };
const page = (slug = data.slug, query = {}) => Page({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(query) });
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data, error: null }); });
afterEach(cleanup);
it("consulta somente slug e página e valida projeção pública", async () => {
  expect(await loadStorefront(data.slug)).toEqual({ status: "ready", storefront: data });
  expect(mocks.rpc).toHaveBeenCalledWith("lookup_tenant_storefront", { p_slug: data.slug, p_page: 1 });
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
  expect(screen.getByText(/Solicitações por esta página ainda não estão disponíveis/)).toBeVisible();
  expect(screen.queryByRole("link", { name: /interesse|solicitar|reservar/i })).toBeNull();
});
it("organização sem frota continua válida e não recebe veículos demo", async () => {
  mocks.rpc.mockResolvedValue({ data: { ...data, city: null, vehicles: [] }, error: null }); render(await page());
  expect(screen.getByText("Cidade não informada")).toBeVisible(); expect(screen.getByText(/Nenhum veículo/)).toBeVisible();
});
it("paginação permanece no slug resolvido", async () => {
  mocks.rpc.mockResolvedValue({ data: { ...data, hasNext: true }, error: null }); render(await page(data.slug, { page: "2" }));
  expect(screen.getByRole("link", { name: "Próxima" })).toHaveAttribute("href", "/locadoras/locadora-a?page=3");
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
  expect(screen.getByText(/Nas vitrines reais, você pode consultar a frota; solicitações ainda não estão disponíveis/)).toBeVisible();
  expect(screen.getByText(/a gestão de reservas ainda não está disponível/)).toBeVisible();
});
