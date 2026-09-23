import { afterEach, expect, it, vi } from "vitest";
import { createStorefrontClient } from "@/modules/storefront/client.server";
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("cliente público não usa sessão e força no-store", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_synthetic");
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); createStorefrontClient();
  const options = mocks.create.mock.calls[0][2];
  expect(options.auth).toEqual({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
  expect(options.global.headers).toBeUndefined(); expect(options.cookies).toBeUndefined();
  await options.global.fetch("https://synthetic.supabase.co", { cache: "force-cache" });
  expect(fetch).toHaveBeenCalledWith("https://synthetic.supabase.co", { cache: "no-store" });
});
