import { beforeEach, expect, it, vi } from "vitest";
import { loadCentralContext, requireCentralContext } from "@/modules/central/access.server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/modules/admin/supabase.server", () => ({ createAdminClient: mocks.create }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
const organizationId = crypto.randomUUID();
let api: ReturnType<typeof fixture>;
function fixture() {
  const membership = { select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { organization_id: organizationId, role: "owner" }, error: null }) };
  const organization = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: organizationId, name: "Locadora sintética" }, error: null }) };
  return { membership, organization, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: crypto.randomUUID(), email: "owner@example.test" } }, error: null }) }, from: vi.fn((table: string) => table === "organization_memberships" ? membership : organization) };
}
beforeEach(() => { vi.clearAllMocks(); api = fixture(); mocks.create.mockResolvedValue(api); });
it("deriva organização e papel da associação validada", async () => {
  expect(await loadCentralContext()).toMatchObject({ status: "ready", role: "owner", email: "owner@example.test", organization: { id: organizationId } });
  expect(api.auth.getUser).toHaveBeenCalledOnce(); expect(api.organization.eq).toHaveBeenCalledWith("id", organizationId);
});
it.each([null, { id: crypto.randomUUID(), is_anonymous: true }])("anônimo não consulta dados", async (user) => {
  api.auth.getUser.mockResolvedValue({ data: { user }, error: null } as never);
  await expect(requireCentralContext()).rejects.toThrow("redirect:/admin/login"); expect(api.from).not.toHaveBeenCalled();
});
it("sem associação segue para onboarding", async () => {
  api.membership.maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(requireCentralContext()).rejects.toThrow("redirect:/admin/onboarding");
});
it("erros e associação inconsistente falham fechado", async () => {
  api.membership.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "private" } });
  expect(await requireCentralContext()).toEqual({ status: "error" });
  api.organization.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
  expect(await requireCentralContext()).toEqual({ status: "error" });
  mocks.create.mockRejectedValueOnce(new Error("private")); expect(await loadCentralContext()).toEqual({ status: "error" });
});
