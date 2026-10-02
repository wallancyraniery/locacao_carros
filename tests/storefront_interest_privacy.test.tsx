import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), storefrontVehicle: vi.fn(), storefrontPrivacy: vi.fn(), catalogVehicle: vi.fn(), globalPrivacy: vi.fn(), turnstile: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/storefront/client.server", () => ({ createStorefrontClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/modules/storefront/queries.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/storefront/queries.server")>()),
  loadStorefrontVehicle: mocks.storefrontVehicle,
  loadStorefrontInterestPrivacy: mocks.storefrontPrivacy,
}));
vi.mock("@/modules/vehicles/infrastructure/catalog_availability.server", () => ({ loadCatalogVehicle: mocks.catalogVehicle }));
vi.mock("@/config/privacy_notice_environment.server", () => ({ getPrivacyNoticeConfiguration: mocks.globalPrivacy }));
vi.mock("@/config/turnstile_environment.server", () => ({ getTurnstileWidgetConfiguration: mocks.turnstile }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

import InterestPage from "@/app/interesse/page";
const actualStorefrontQueries = await vi.importActual<typeof import("@/modules/storefront/queries.server")>("@/modules/storefront/queries.server");

const slug = "locadora-a";
const vehicleId = "20000000-0000-4000-8000-000000000011";
const tenantPrivacy = { mode: "configured" as const, controllerName: "Locadora A Ltda", contactLabel: "Canal da Locadora A", contactHref: "mailto:privacidade@locadora-a.com.br" };
const storefront = { status: "ready" as const, storefront: { slug, name: "Locadora A", city: "Cidade", vehicle: { id: vehicleId, brand: "Marca", model: "Modelo", year: 2024, weekly_price_cents: 80000, images: [] } } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: { data_controller: tenantPrivacy.controllerName, privacy_channel_label: tenantPrivacy.contactLabel, privacy_channel_url: tenantPrivacy.contactHref }, error: null });
  mocks.storefrontVehicle.mockResolvedValue(storefront);
  mocks.catalogVehicle.mockResolvedValue({ id: vehicleId, model: "Demo", acceptsInterest: true });
  mocks.storefrontPrivacy.mockResolvedValue({ status: "ready", configuration: tenantPrivacy });
  mocks.globalPrivacy.mockReturnValue({ mode: "configured", controllerName: "Global legado", contactLabel: "Canal global", contactHref: "mailto:global@legado.com.br" });
  mocks.turnstile.mockReturnValue({ mode: "local" });
});
afterEach(cleanup);

it("consulta somente slug e veículo e aceita somente os três dados públicos válidos", async () => {
  await expect(actualStorefrontQueries.loadStorefrontInterestPrivacy(slug, vehicleId)).resolves.toEqual({ status: "ready", configuration: tenantPrivacy });
  expect(mocks.rpc).toHaveBeenCalledWith("lookup_tenant_storefront_interest_privacy", { p_slug: slug, p_vehicle_id: vehicleId });
});
it.each([
  ["slug inválido", "../admin", vehicleId, undefined],
  ["veículo inválido", slug, "invalid", undefined],
  ["draft ou veículo inelegível", slug, vehicleId, null],
  ["controlador ausente", slug, vehicleId, { privacy_channel_label: "Canal", privacy_channel_url: "mailto:privacidade@locadora-a.com.br" }],
  ["URL inválida", slug, vehicleId, { data_controller: "Locadora A", privacy_channel_label: "Canal", privacy_channel_url: "mailto:privacidade@example.test" }],
])("%s falha fechado", async (_name, inputSlug, inputVehicle, data) => {
  mocks.rpc.mockClear();
  if (data !== undefined) mocks.rpc.mockResolvedValue({ data, error: null });
  const result = await actualStorefrontQueries.loadStorefrontInterestPrivacy(inputSlug, inputVehicle);
  expect(result.status).not.toBe("ready");
  if (data === undefined) expect(mocks.rpc).not.toHaveBeenCalled();
});
it("não aceita campos extras ou contexto fornecido pelo browser", async () => {
  mocks.rpc.mockResolvedValue({ data: { data_controller: "Locadora A", privacy_channel_label: "Canal", privacy_channel_url: "mailto:privacidade@locadora-a.com.br", organization_id: "forged" }, error: null });
  await expect(actualStorefrontQueries.loadStorefrontInterestPrivacy(slug, vehicleId)).resolves.toEqual({ status: "error" });
});
it("formulário storefront usa somente privacidade da locadora", async () => {
  render(await InterestPage({ searchParams: Promise.resolve({ storefront: slug, vehicle: vehicleId }) }));
  expect(screen.getByText(tenantPrivacy.controllerName)).toBeVisible();
  expect(screen.getByRole("link", { name: tenantPrivacy.contactLabel })).toHaveAttribute("href", tenantPrivacy.contactHref);
  expect(screen.queryByText("Global legado")).toBeNull();
  expect(mocks.globalPrivacy).not.toHaveBeenCalled();
});
it("privacidade tenant ausente ou inválida não renderiza formulário", async () => {
  mocks.storefrontPrivacy.mockResolvedValue({ status: "error" });
  render(await InterestPage({ searchParams: Promise.resolve({ storefront: slug, vehicle: vehicleId }) }));
  expect(screen.getByRole("heading", { name: "Interesse indisponível" })).toBeVisible();
  expect(screen.queryByRole("button", { name: /enviar interesse/i })).toBeNull();
});
it("demo legado mantém a configuração global", async () => {
  mocks.storefrontVehicle.mockResolvedValue(undefined);
  render(await InterestPage({ searchParams: Promise.resolve({ vehicle: vehicleId }) }));
  expect(screen.getByText("Global legado")).toBeVisible();
  expect(mocks.globalPrivacy).toHaveBeenCalledOnce();
  expect(mocks.storefrontPrivacy).not.toHaveBeenCalled();
});
