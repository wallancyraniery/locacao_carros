import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ReservationPage from "@/app/reserva/page";
import VehicleDetailPage from "@/app/veiculos/[id]/page";
import { vehicles } from "@/modules/vehicles/data/vehicles";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ available: vi.fn(), submit: vi.fn(), catalog: vi.fn() }));
vi.mock("@/modules/vehicles/infrastructure/availability_repository.server", () => ({ availabilityRepository: { isAvailable: mocks.available } }));
vi.mock("@/modules/vehicles/infrastructure/catalog_availability.server", () => ({ loadCatalogVehicle: mocks.catalog }));
vi.mock("@/modules/reservations/actions/submit_reservation_request_action", () => ({ submitReservationRequestAction: mocks.submit }));
vi.mock("@/config/turnstile_environment.server", () => ({ getTurnstileWidgetConfiguration: () => ({ mode: "local" }) }));
vi.mock("@/config/privacy_notice_environment.server", () => ({ getPrivacyNoticeConfiguration: () => ({ mode: "pending" }) }));
afterEach(cleanup);
const params = { vehicle: vehicles[0].id, pickupDate: "2028-05-10", returnDate: "2028-05-15" };
beforeEach(() => { vi.clearAllMocks(); mocks.available.mockResolvedValue(true); mocks.catalog.mockResolvedValue({ ...vehicles[0], acceptsInterest: true }); mocks.submit.mockResolvedValue({ status: "error", message: "Tente novamente neste formulário." }); });

it.each([
  { ...params, pickupDate: "2028-02-30" }, { ...params, pickupDate: params.returnDate },
  { ...params, vehicle: "invalid" }, { ...params, vehicle: [params.vehicle, params.vehicle] },
  { ...params, returnDate: undefined }, { ...params, returnDate: "2028-05-15T00:00:00Z" },
])("revalida parâmetros no servidor: %j", async (searchParams) => {
  render(await ReservationPage({ searchParams: Promise.resolve(searchParams) }));
  expect(screen.getByRole("heading", { name: "Revise o período escolhido" })).toBeInTheDocument();
  expect(mocks.available).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Solicitar reserva" })).toBeNull();
});

it("mostra resumo civil e mantém contexto criado no servidor em retries", async () => {
  render(await ReservationPage({ searchParams: Promise.resolve(params) }));
  expect(screen.getByText(vehicles[0].model)).toBeInTheDocument();
  expect(screen.getByText("10/05/2028")).toHaveAttribute("datetime", params.pickupDate);
  expect(screen.getByText("15/05/2028")).toHaveAttribute("datetime", params.returnDate);
  expect(screen.getByRole("heading", { name: "Condições principais" })).toBeInTheDocument();
  expect(mocks.available).toHaveBeenCalledWith({ vehicleId: params.vehicle, pickupDate: params.pickupDate, returnDate: params.returnDate });
  expect(mocks.submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Solicitar reserva" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Solicitar reserva" }));
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
  const context = mocks.submit.mock.calls[0][0];
  expect(context).toEqual({ vehicleId: params.vehicle, pickupDate: params.pickupDate, returnDate: params.returnDate, operationId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  expect(mocks.submit.mock.calls[1][0]).toEqual(context);
  expect(screen.getByText("10/05/2028")).toBeInTheDocument();
});

it("reconsulta disponibilidade ao abrir a página e não mostra formulário quando indisponível", async () => {
  mocks.available.mockResolvedValue(false);
  render(await ReservationPage({ searchParams: Promise.resolve(params) }));
  expect(screen.getByRole("heading", { name: "Escolha outras datas" })).toBeInTheDocument();
  expect(screen.getByText("Esse veículo não está disponível nesse período.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Solicitar reserva" })).toBeNull();
  expect(screen.getByRole("link", { name: "Escolher novas datas" }).getAttribute("href")).toContain("pickupDate=2028-05-10&returnDate=2028-05-15");
  expect(mocks.submit).not.toHaveBeenCalled();
});

it("página do veículo conserva interesse e integra inputs nativos com datas de retorno", async () => {
  render(await VehicleDetailPage({ params: Promise.resolve({ id: params.vehicle }), searchParams: Promise.resolve(params) }));
  expect(screen.getByRole("link", { name: "Tenho interesse" })).toHaveAttribute("href", `/interesse?vehicle=${params.vehicle}`);
  expect(screen.getByLabelText("Data de retirada")).toHaveValue(params.pickupDate);
  expect(screen.getByLabelText("Data de devolução")).toHaveAttribute("type", "date");
});

it("falha técnica não informa indisponibilidade nem libera a solicitação", async () => {
  mocks.available.mockRejectedValueOnce(new Error("SQL password privado"));
  render(await ReservationPage({ searchParams: Promise.resolve(params) }));
  expect(screen.getByRole("status")).toHaveTextContent("Não foi possível confirmar a disponibilidade agora. Tente novamente em instantes.");
  expect(screen.getByRole("main")).not.toHaveTextContent(/indisponível|não está disponível|SQL|password/i);
  expect(screen.queryByRole("button", { name: "Solicitar reserva" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Continuar solicitação" })).toBeNull();
  expect(screen.getByRole("link", { name: "Consultar disponibilidade novamente" }).getAttribute("href")).toContain("pickupDate=2028-05-10&returnDate=2028-05-15");
  expect(mocks.submit).not.toHaveBeenCalled();
});
