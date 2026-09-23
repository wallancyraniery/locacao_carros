import "server-only";
import { createAdminClient } from "@/modules/admin/supabase.server";

export type OrganizationAccess =
  | { status: "anonymous" | "unassigned" | "error" }
  | { status: "ready"; organizationId: string };

export async function loadOrganizationAccess(): Promise<OrganizationAccess> {
  try {
    const client = await createAdminClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user || data.user.is_anonymous) return { status: "anonymous" };
    const result = await client.from("organization_memberships").select("organization_id").maybeSingle();
    if (result.error) return { status: "error" };
    if (!result.data) return { status: "unassigned" };
    return { status: "ready", organizationId: result.data.organization_id };
  } catch {
    return { status: "error" };
  }
}
