import "server-only";
import { createAdminClient } from "./supabase.server";

export type InterestedLead = {
  id: string;
  created_at: string;
  full_name: string;
  phone: string;
  email: string | null;
  city: string;
  preferred_contact_time: string | null;
  status: string;
  vehicles: { brand: string; model: string; version: string | null; year: number } | null;
};
export type InterestedLeadsResult =
  | { status: "anonymous" | "unassigned" | "error" }
  | { status: "ready"; leads: InterestedLead[]; hasNext: boolean };

const pageSize = 50;
export async function loadInterestedLeads(page: number): Promise<InterestedLeadsResult> {
  try {
    const client = await createAdminClient();
    // Validate with Auth instead of trusting the user object stored in cookies.
    const { data: identity, error: identityError } = await client.auth.getUser();
    if (identityError || !identity.user || identity.user.is_anonymous) return { status: "anonymous" };
    const { data: membership, error: membershipError } = await client.from("organization_memberships")
      .select("organization_id").maybeSingle();
    if (membershipError) return { status: "error" };
    if (!membership) return { status: "unassigned" };
    // No organization supplied by the browser. RLS is the authorization boundary for every row.
    const { data, error } = await client.from("rental_leads")
      .select("id,created_at,full_name,phone,email,city,preferred_contact_time,status,vehicles!rental_leads_vehicle_id_fk(brand,model,version,year)")
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize);
    if (error || !data) return { status: "error" };
    return { status: "ready", leads: data.slice(0, pageSize) as unknown as InterestedLead[], hasNext: data.length > pageSize };
  } catch {
    return { status: "error" };
  }
}
