import "server-only";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/modules/admin/supabase.server";

export type Organization = { id: string; name: string; slug: string; city: string | null;
  storefront_status: "draft" | "published"; data_controller: string | null; privacy_channel_label: string | null; privacy_channel_url: string | null };
export async function loadCentralContext() {
  try {
    const client = await createAdminClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user || data.user.is_anonymous) return { status: "anonymous" as const };
    const membership = await client.from("organization_memberships").select("organization_id,role").maybeSingle();
    if (membership.error) return { status: "error" as const };
    if (!membership.data) return { status: "unassigned" as const };
    if (!["owner", "member"].includes(membership.data.role)) return { status: "error" as const };
    const organization = await client.from("organizations")
      .select("id,name,slug,city,storefront_status,data_controller,privacy_channel_label,privacy_channel_url")
      .eq("id", membership.data.organization_id).maybeSingle();
    if (organization.error || !organization.data) return { status: "error" as const };
    return { status: "ready" as const, client, role: membership.data.role as "owner" | "member", organization: organization.data as Organization };
  } catch { return { status: "error" as const }; }
}
export async function requireCentralContext() {
  const context = await loadCentralContext();
  if (context.status === "anonymous") redirect("/admin/login");
  if (context.status === "unassigned") redirect("/admin/onboarding");
  return context;
}
