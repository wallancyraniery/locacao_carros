"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadCentralContext } from "@/modules/central/access.server";
import { vehicleInputSchema } from "./validation";

export type VehicleFormState = { message?: string };
export async function createVehicle(operationId: string, _state: VehicleFormState, form: FormData): Promise<VehicleFormState> {
  const input = vehicleInputSchema.safeParse({ operationId, brand: form.get("brand"), model: form.get("model"),
    version: form.get("version") ?? "", year: form.get("year"), color: form.get("color"),
    weeklyPrice: form.get("weeklyPrice"), operationalStatus: form.get("operationalStatus") });
  if (!input.success) return { message: "Confira os dados do veículo e informe um valor semanal válido." };
  try {
    const context = await loadCentralContext();
    if (context.status !== "ready" || context.role !== "owner") return { message: "Não foi possível cadastrar. Entre com a conta proprietária da locadora." };
    const value = input.data;
    const { data, error } = await context.client.rpc("create_fleet_vehicle", {
      p_operation_id: value.operationId, p_brand: value.brand, p_model: value.model, p_version: value.version,
      p_year: value.year, p_color: value.color, p_weekly_price_cents: value.weeklyPrice, p_operational_status: value.operationalStatus,
    });
    if (error || data !== operationId) return { message: "Não foi possível cadastrar o veículo. Tente novamente neste formulário." };
  } catch { return { message: "Não foi possível cadastrar o veículo. Tente novamente neste formulário." }; }
  revalidatePath("/admin", "layout");
  redirect("/admin/veiculos");
}
