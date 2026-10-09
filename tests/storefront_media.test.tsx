import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadStorefront, loadStorefrontVehicle } from "@/modules/storefront/queries.server";
import Page from "@/app/locadoras/[slug]/page";
import VehiclePage from "@/app/locadoras/[slug]/veiculos/[vehicleId]/page";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sign: vi.fn(), context: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/storefront/client.server", () => ({ createStorefrontClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/modules/vehicle_media/queries.server", () => ({ signPublicMedia: mocks.sign }));
vi.mock("@/modules/central/access.server", () => ({ loadCentralContext: mocks.context }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
const org = "10000000-0000-4000-8000-000000000001";
const id = "20000000-0000-4000-8000-000000000011";
const imageIds = ["60000000-0000-4000-8000-000000000001", "60000000-0000-4000-8000-000000000002"];
const images = imageIds.map((imageId, position) => ({ id: imageId, position, storage_path: `${org}/${id}/${imageId}.jpg`, width: 800, height: 600 }));
const vehicle = { id, brand: "Marca", model: "Modelo", version: "Versão", year: 2024, color: "Prata", weekly_price_cents: 80000, images };
const organization = { slug: "locadora-sintetica", name: "Locadora sintética", city: "Cidade sintética" };
const data = { ...organization, vehicles: [vehicle], hasNext: false };
const signed = images.map(({ storage_path, ...image }) => ({ ...image, url: `https://synthetic.supabase.co/storage/v1/object/sign/vehicle-media/${storage_path}?token=synthetic-capability` }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data, error: null }); mocks.context.mockResolvedValue({ status: "anonymous" });
  mocks.sign.mockImplementation(async (records: typeof images) => ({ status: "ready", images: records.map((image) => signed.find((item) => item.id === image.id)) }));
});
afterEach(cleanup);
it("vitrine assina somente a capa e não encaminha metadados de Storage ao componente", async () => {
  const result = await loadStorefront(organization.slug);
  expect(mocks.sign).toHaveBeenCalledWith([images[0]]);
  expect(result).toEqual({ status: "ready", storefront: { ...data, vehicles: [{ ...vehicle, images: [signed[0]] }] } });
  expect(JSON.stringify(result)).not.toContain('"storage_path"');
});
it("vitrine com foto renderiza a capa real sem placeholder e oferece detalhe no mesmo slug", async () => {
  render(await Page({ params: Promise.resolve({ slug: organization.slug }), searchParams: Promise.resolve({}) }));
  const image = screen.getByRole("img");
  expect(image).toHaveAttribute("src", signed[0].url);
  expect(image.getAttribute("src")).not.toContain("/_next/image");
  expect(screen.queryByText("Sem foto")).toBeNull();
  expect(screen.getByRole("link", { name: /detalhes|fotos|conhecer/i })).toHaveAttribute("href", `/locadoras/${organization.slug}/veiculos/${id}`);
});
it("detalhe resolve slug e veículo juntos e entrega galeria na ordem da projeção", async () => {
  mocks.rpc.mockResolvedValue({ data: { ...organization, vehicle }, error: null });
  expect(await loadStorefrontVehicle(organization.slug, id)).toEqual({ status: "ready", storefront: { ...organization, vehicle: { ...vehicle, images: signed } } });
  expect(mocks.rpc).toHaveBeenCalledWith("lookup_tenant_storefront_vehicle", { p_slug: organization.slug, p_vehicle_id: id });
  expect(mocks.sign).toHaveBeenCalledWith(images);
});
it("detalhe público oferece retorno à frota no slug correto sem CTA inexistente", async () => {
  mocks.rpc.mockResolvedValue({ data: { ...organization, vehicle }, error: null });
  render(await VehiclePage({ params: Promise.resolve({ slug: organization.slug, vehicleId: id }), searchParams: Promise.resolve({}) }));
  expect(screen.queryByRole("link", { name: "Início" })).toBeNull();
  expect(screen.getByRole("region", { name: "Fotos do veículo" })).toBeVisible();
  expect(screen.getByRole("region", { name: "Detalhes do veículo" })).toBeVisible();
  expect(screen.getByRole("link", { name: "← Voltar à frota" })).toHaveAttribute("href", `/locadoras/${organization.slug}`);
  expect(screen.getByRole("link", { name: "Tenho interesse" })).toHaveAttribute("href", `/interesse?storefront=${organization.slug}&vehicle=${id}`);
});
it("detalhe do preview preserva o contexto no retorno à frota", async () => {
  mocks.rpc.mockResolvedValue({ data: { ...organization, vehicle }, error: null });
  mocks.context.mockResolvedValue({ status: "ready", organization: { slug: organization.slug } });
  render(await VehiclePage({ params: Promise.resolve({ slug: organization.slug, vehicleId: id }), searchParams: Promise.resolve({ preview: "central" }) }));
  expect(screen.getByRole("link", { name: "← Voltar à frota" })).toHaveAttribute("href", `/locadoras/${organization.slug}?preview=central`);
  expect(screen.getByRole("navigation", { name: "Pré-visualização da Central" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Tenho interesse" })).toBeNull();
  expect(screen.getByText("Envio de interesse desativado na pré-visualização")).toHaveAttribute("aria-disabled", "true");
});
it.each([
  ["sem sessão", { status: "anonymous" }],
  ["de outro tenant", { status: "ready", organization: { slug: "outra-locadora" } }],
])("preview %s mantém o CTA público ativo", async (_scenario, context) => {
  mocks.rpc.mockResolvedValue({ data: { ...organization, vehicle }, error: null });
  mocks.context.mockResolvedValue(context);
  render(await VehiclePage({ params: Promise.resolve({ slug: organization.slug, vehicleId: id }), searchParams: Promise.resolve({ preview: "central" }) }));
  expect(screen.queryByRole("navigation", { name: "Pré-visualização da Central" })).toBeNull();
  expect(screen.getByRole("link", { name: "Tenho interesse" })).toHaveAttribute("href", `/interesse?storefront=${organization.slug}&vehicle=${id}`);
});
it.each(["draft", "veículo de outra locadora", "inativo", "demo", "ausente"])("detalhe %s não revela nem assina fotos", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  expect(await loadStorefrontVehicle(organization.slug, id)).toEqual({ status: "missing" });
  expect(mocks.sign).not.toHaveBeenCalled();
});
it.each([["../admin", id], [organization.slug, "not-a-uuid"]])("parâmetros inválidos não chegam ao banco", async (slug, vehicleId) => {
  expect(await loadStorefrontVehicle(slug, vehicleId)).toEqual({ status: "missing" });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("detalhe recusa veículo diferente retornado pela fronteira", async () => {
  mocks.rpc.mockResolvedValue({ data: { ...organization, vehicle: { ...vehicle, id: org } }, error: null });
  expect(await loadStorefrontVehicle(organization.slug, id)).toEqual({ status: "error" });
  expect(mocks.sign).not.toHaveBeenCalled();
});
const invalidMediaCases = [
  [{ ...images[0], storage_path: `${org}/${org}/${images[0].id}.jpg` }],
  [{ ...images[0], storage_path: `https://arbitrary.example.test/photo.jpg` }],
  [{ ...images[0], storage_path: `${org}/${id}/${images[0].id}.svg` }],
  [images[1], images[0]],
  [images[0], images[0]],
];
it.each(invalidMediaCases.map((invalidImages) => [invalidImages] as const))(
  "projeção inconsistente de mídia falha fechada",
  async (invalidImages) => {
    mocks.rpc.mockResolvedValue({ data: { ...data, vehicles: [{ ...vehicle, images: invalidImages }] }, error: null });
    expect(await loadStorefront(organization.slug)).toEqual({ status: "error" });
    expect(mocks.sign).not.toHaveBeenCalled();
  },
);
it("falha técnica ao assinar não vira Sem foto nem expõe erro privado", async () => {
  mocks.sign.mockRejectedValue(new Error("SQL token owner@example.test signed-private-url"));
  const log = vi.spyOn(console, "error");
  render(await Page({ params: Promise.resolve({ slug: organization.slug }), searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível consultar");
  expect(screen.queryByText("Sem foto")).toBeNull();
  expect(document.body.textContent).not.toMatch(/SQL|token|owner@|signed-private/);
  expect(log).not.toHaveBeenCalled(); log.mockRestore();
});
it("retorno de assinatura incompleto não publica galeria parcial", async () => {
  mocks.rpc.mockResolvedValue({ data: { ...organization, vehicle }, error: null });
  mocks.sign.mockResolvedValue({ status: "ready", images: [signed[0]] });
  expect(await loadStorefrontVehicle(organization.slug, id)).toEqual({ status: "error" });
});
