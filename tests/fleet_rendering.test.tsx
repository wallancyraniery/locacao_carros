import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Overview from "@/app/admin/page";
import Vehicles from "@/app/admin/veiculos/page";
import NewVehicle from "@/app/admin/veiculos/novo/page";
import Organization from "@/app/admin/locadora/page";
import Reservations from "@/app/admin/reservas/page";
import { VehicleForm } from "@/modules/fleet/form";
const mocks = vi.hoisted(() => ({ context: vi.fn(), fleet: vi.fn(), summary: vi.fn(), create: vi.fn(), logout: vi.fn() }));
vi.mock("@/modules/central/access.server", () => ({ requireCentralContext: mocks.context }));
vi.mock("@/modules/fleet/queries.server", () => ({ loadFleet: mocks.fleet, loadFleetSummary: mocks.summary }));
vi.mock("@/modules/fleet/actions", () => ({ createVehicle: mocks.create }));
vi.mock("@/modules/admin/auth_actions", () => ({ logout: mocks.logout }));
const context = { status: "ready", role: "owner", client: {}, organization: { id: "opaque", name: "Locadora A", slug: "locadora-a", city: "Cidade sintética" } };
beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue(context); mocks.summary.mockResolvedValue({ status: "ready", active: 2, inactive: 1 }); mocks.fleet.mockResolvedValue({ status: "ready", vehicles: [], hasNext: false }); });
afterEach(cleanup);
it("visão geral mostra contagens reais e cinco destinos úteis", async () => {
  render(await Overview());
  expect(screen.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  expect(screen.getByText("2")).toBeVisible(); expect(screen.getByText("1")).toBeVisible();
  const nav = screen.getByRole("navigation", { name: "Central da locadora" });
  expect(nav.querySelectorAll("a")).toHaveLength(5);
  expect(screen.getByRole("link", { name: "Visão geral" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: "Sair" })).toBeVisible();
});
it("erro de contagem não inventa métricas", async () => {
  mocks.summary.mockResolvedValue({ status: "error" }); render(await Overview());
  expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível consultar"); expect(screen.queryByText("0")).toBeNull();
});
it("lista veículos sem fotos demonstrativas e pagina", async () => {
  mocks.fleet.mockResolvedValue({ status: "ready", hasNext: true, vehicles: [{ id: "opaque", brand: "Marca", model: "Modelo", year: 2024, color: "Prata", weekly_price_cents: 70050, operational_status: "active" }] });
  render(await Vehicles({ searchParams: Promise.resolve({ page: "2" }) }));
  expect(screen.getByText("Marca Modelo")).toBeVisible(); expect(screen.getByText("Sem foto")).toBeVisible();
  expect(screen.queryByRole("img")).toBeNull(); expect(screen.getByRole("link", { name: "Próxima" })).toHaveAttribute("href", "/admin/veiculos?page=3");
});
it("member pode ler mas não recebe formulário de cadastro", async () => {
  mocks.context.mockResolvedValue({ ...context, role: "member" }); render(await NewVehicle());
  expect(screen.getByRole("alert")).toHaveTextContent("Somente a conta proprietária"); expect(screen.queryByRole("button", { name: "Cadastrar veículo" })).toBeNull();
});
it("minha locadora apresenta dados próprios sem anunciar página pública pronta", async () => {
  render(await Organization()); expect(screen.getByText("locadora-a")).toBeVisible(); expect(screen.getByText(/página pública da locadora ainda/)).toBeVisible();
  expect(screen.queryByRole("link", { name: "locadora-a" })).toBeNull();
});
it("reservas explica limites sem fingir listagem, calendário ou ausência de registros", async () => {
  render(await Reservations()); expect(screen.getByText(/não lista solicitações nem confirma ausência/)).toBeVisible();
  expect(screen.queryByRole("table")).toBeNull(); expect(screen.queryByRole("button", { name: /aprovar/i })).toBeNull();
});
it.each([Overview, Organization, Reservations, NewVehicle])("falha de acesso não revela dados ou formulário", async (page) => {
  mocks.context.mockResolvedValue({ status: "error" }); render(await page());
  expect(screen.getByRole("alert")).toBeVisible(); expect(screen.queryByText("Locadora A")).toBeNull(); expect(screen.queryByRole("textbox")).toBeNull();
});
it("formulário preserva os valores e a operação no retry", async () => {
  mocks.create.mockResolvedValue({ message: "Tente novamente neste formulário." });
  const operation = crypto.randomUUID(); render(<VehicleForm operationId={operation} />);
  fireEvent.change(screen.getByLabelText("Marca"), { target: { value: "Marca sintética" } });
  for (let i = 0; i < 2; i++) { fireEvent.submit(screen.getByRole("button", { name: "Cadastrar veículo" }).closest("form")!); await screen.findByRole("alert"); }
  expect(screen.getByLabelText("Marca")).toHaveValue("Marca sintética");
  expect(mocks.create.mock.calls.map((call) => call[0])).toEqual([operation, operation]);
  expect(document.querySelector('input[name="organizationId"]')).toBeNull();
});

it("querystring não pode anunciar cadastro sem confirmação", async () => {
  const params = { created: "1", page: "1" };
  render(await Vehicles({ searchParams: Promise.resolve(params) }));
  expect(screen.queryByText(/Veículo cadastrado/)).toBeNull();
  expect(screen.getByText("Nenhum veículo nesta página.")).toBeVisible();
});
