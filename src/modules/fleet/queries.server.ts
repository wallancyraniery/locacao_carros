import "server-only";
import type { createAdminClient } from "@/modules/admin/supabase.server";

type Client = Awaited<ReturnType<typeof createAdminClient>>;
export type FleetVehicle = { id: string; brand: string; model: string; version: string | null; year: number;
  color: string; weekly_price_cents: number; operational_status: "active" | "inactive" };
export async function loadFleet(client: Client, page: number) {
  try {
    const safePage = Number.isInteger(page) && page > 0 && page <= 99999 ? page : 1;
    const { data, error } = await client.from("vehicles")
      .select("id,brand,model,version,year,color,weekly_price_cents,operational_status")
      .eq("is_demo", false).order("created_at", { ascending: false }).order("id", { ascending: false })
      .range((safePage - 1) * 50, safePage * 50);
    if (error || !data) return { status: "error" as const };
    return { status: "ready" as const, vehicles: data.slice(0, 50) as FleetVehicle[], hasNext: data.length > 50 };
  } catch { return { status: "error" as const }; }
}
export async function loadFleetSummary(client: Client) {
  try {
    const results = await Promise.all((["active", "inactive"] as const).map((status) => client.from("vehicles")
      .select("id", { count: "exact", head: true }).eq("is_demo", false).eq("operational_status", status)));
    if (results.some((result) => result.error || result.count === null)) return { status: "error" as const };
    return { status: "ready" as const, active: results[0].count!, inactive: results[1].count! };
  } catch { return { status: "error" as const }; }
}
