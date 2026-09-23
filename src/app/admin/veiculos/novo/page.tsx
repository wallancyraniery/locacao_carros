import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireCentralContext } from "@/modules/central/access.server";
import { CentralShell, CentralError } from "@/modules/central/shell";
import { VehicleForm } from "@/modules/fleet/form";

export default async function NewVehiclePage() {
  const context = await requireCentralContext();
  if (context.status !== "ready") return <CentralError />;
  return <CentralShell title="Cadastrar veículo" current="/admin/veiculos" name={context.organization.name}>
    {context.role === "owner" ? <VehicleForm operationId={randomUUID()} /> : <p role="alert">Somente a conta proprietária pode cadastrar veículos.</p>}
    <Link href="/admin/veiculos" prefetch={false}>Voltar para veículos</Link>
  </CentralShell>;
}
