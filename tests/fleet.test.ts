import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vehicleInputSchema } from "@/modules/fleet/validation";
import { createVehicle } from "@/modules/fleet/actions";
import { loadFleet, loadFleetSummary } from "@/modules/fleet/queries.server";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/modules/central/access.server", () => ({ loadCentralContext: mocks.context }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const input = { operationId: "60000000-0000-4000-8000-000000000001", brand: "Marca", model: "Modelo", version: "",
  year: "2024", color: "Prata", weeklyPrice: "700,50", operationalStatus: "active" };
const form = (overrides = {}) => { const value = new FormData(); for (const [key, data] of Object.entries({ ...input, ...overrides })) value.set(key, data); return value; };
beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ status: "ready", role: "owner", client: { rpc: mocks.rpc } }); mocks.rpc.mockResolvedValue({ data: input.operationId, error: null }); });
afterEach(() => vi.restoreAllMocks());
describe("cadastro da frota", () => {
  it("normaliza valores em centavos sem ponto flutuante", () => {
    expect(vehicleInputSchema.parse(input)).toMatchObject({ weeklyPrice: 70050, version: null, year: 2024 });
    expect(vehicleInputSchema.parse({ ...input, weeklyPrice: "0.01" }).weeklyPrice).toBe(1);
  });
  it.each([{ brand: "" }, { model: "x".repeat(121) }, { color: "a\nb" }, { year: "1899" }, { year: "2201" },
    { year: "2024.5" }, { weeklyPrice: "-1" }, { weeklyPrice: "1e3" }, { weeklyPrice: "1.234,56" }, { weeklyPrice: "21474836.48" },
    { operationalStatus: "available" }, { operationId: "invalid" }])("recusa entrada inválida %j", async (overrides) => {
    expect(vehicleInputSchema.safeParse({ ...input, ...overrides }).success).toBe(false);
    const result = await createVehicle(overrides.operationId ?? input.operationId, {}, form(overrides));
    expect(result.message).toContain("Confira"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["anonymous", "unassigned", "error", "member"])("não permite cadastro para %s", async (status) => {
    mocks.context.mockResolvedValue(status === "member" ? { status: "ready", role: "member" } : { status });
    expect(await createVehicle(input.operationId, {}, form())).toHaveProperty("message"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("ignora organização, usuário, is_demo e ID do formulário; retry usa mesma operação", async () => {
    const data = form({ organizationId: crypto.randomUUID(), userId: crypto.randomUUID(), is_demo: "true", operationId: crypto.randomUUID() });
    for (let i = 0; i < 2; i++) await expect(createVehicle(input.operationId, {}, data)).rejects.toThrow("redirect:/admin/veiculos");
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    for (const call of mocks.rpc.mock.calls) expect(call).toEqual(["create_fleet_vehicle", {
      p_operation_id: input.operationId, p_brand: "Marca", p_model: "Modelo", p_version: null, p_year: 2024,
      p_color: "Prata", p_weekly_price_cents: 70050, p_operational_status: "active",
    }]);
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin", "layout");
  });
  it("erro ou recibo inesperado não expõe SQL, tokens ou PII nem registra detalhes", async () => {
    const spies = ["error", "warn", "log", "info", "debug"].map((method) => vi.spyOn(console, method as "error").mockImplementation(() => undefined));
    const secret = "SQL token-private secret@example.test senha";
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: secret } }).mockRejectedValueOnce(new Error(secret)).mockResolvedValueOnce({ data: secret, error: null });
    for (let i = 0; i < 3; i++) expect(await createVehicle(input.operationId, {}, form())).toEqual({ message: "Não foi possível cadastrar o veículo. Tente novamente neste formulário." });
    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
function query(result: unknown) {
  const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
  for (const method of [chain.select, chain.eq, chain.order, chain.range]) method.mockReturnValue(chain);
  return chain;
}
it("listagem paginada exclui demonstrações sem receber organização do navegador", async () => {
  const chain = query({ data: Array.from({ length: 51 }, (_, i) => ({ id: String(i) })), error: null });
  const client = { from: vi.fn(() => chain) };
  expect(await loadFleet(client as never, 2)).toMatchObject({ status: "ready", hasNext: true, vehicles: expect.any(Array) });
  expect(chain.eq).toHaveBeenCalledWith("is_demo", false); expect(chain.range).toHaveBeenCalledWith(50, 100);
});
it("resumo usa contagem exata por estado e exclui demo", async () => {
  const a = query({ count: 3, error: null }); const b = query({ count: 2, error: null });
  const client = { from: vi.fn().mockReturnValueOnce(a).mockReturnValueOnce(b) };
  expect(await loadFleetSummary(client as never)).toEqual({ status: "ready", active: 3, inactive: 2 });
  expect(a.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
  expect(a.eq).toHaveBeenCalledWith("is_demo", false); expect(b.eq).toHaveBeenCalledWith("is_demo", false);
  expect(a.eq).toHaveBeenCalledWith("operational_status", "active"); expect(b.eq).toHaveBeenCalledWith("operational_status", "inactive");
});
it("falha de leitura não vira lista vazia ou métrica zero", async () => {
  const client = { from: vi.fn(() => query({ data: null, count: null, error: { message: "private" } })) };
  expect(await loadFleet(client as never, 1)).toEqual({ status: "error" });
  expect(await loadFleetSummary(client as never)).toEqual({ status: "error" });
});
