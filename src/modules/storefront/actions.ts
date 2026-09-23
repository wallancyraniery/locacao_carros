"use server";

import { revalidatePath } from "next/cache";
import { loadCentralContext } from "@/modules/central/access.server";

export type PublicationState = { message?: string };
export async function setStorefrontStatus(_state: PublicationState, form: FormData): Promise<PublicationState> {
  const status = form.get("status");
  const failure = { message: "Não foi possível alterar a publicação. Tente novamente com a conta proprietária da locadora." };
  if (status !== "draft" && status !== "published") return failure;
  try {
    const context = await loadCentralContext();
    if (context.status !== "ready" || context.role !== "owner") return failure;
    const { data, error } = await context.client.rpc("set_tenant_storefront_status", { p_status: status });
    if (error || data !== status) return failure;
    revalidatePath("/admin/locadora");
    revalidatePath(`/locadoras/${context.organization.slug}`);
    return { message: status === "published" ? "Vitrine publicada." : "Vitrine despublicada." };
  } catch { return failure; }
}
