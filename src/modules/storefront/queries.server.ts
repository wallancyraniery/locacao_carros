import "server-only";
import { createStorefrontClient } from "./client.server";
import { storefrontSchema, storefrontSlug, type Storefront } from "./contracts";

type Result = { status: "ready"; storefront: Storefront } | { status: "missing" | "error" };
export async function loadStorefront(slug: string, page = 1): Promise<Result> {
  if (!storefrontSlug.safeParse(slug).success || !Number.isInteger(page) || page < 1 || page > 10000) return { status: "missing" };
  try {
    const { data, error } = await createStorefrontClient().rpc("lookup_tenant_storefront", { p_slug: slug, p_page: page });
    if (error) return { status: "error" };
    if (data === null) return { status: "missing" };
    const parsed = storefrontSchema.safeParse(data);
    if (!parsed.success || parsed.data.slug !== slug) return { status: "error" };
    return { status: "ready", storefront: parsed.data };
  } catch {
    return { status: "error" };
  }
}
