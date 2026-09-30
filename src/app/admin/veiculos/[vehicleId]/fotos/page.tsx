import Link from "next/link";
import { requireCentralContext } from "@/modules/central/access.server";
import { CentralShell, CentralError } from "@/modules/central/shell";
import { loadManagedMedia } from "@/modules/vehicle_media/manage.server";
import { VehicleMediaManager } from "@/modules/vehicle_media/manager";

export default async function VehiclePhotosPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const context = await requireCentralContext();
  if (context.status !== "ready") return <CentralError />;
  const { vehicleId } = await params;
  const result = context.role === "owner" ? await loadManagedMedia(vehicleId) : null;
  return <CentralShell title="Fotos do veículo" current="/admin/veiculos" name={context.organization.name} email={context.email} role={context.role}>
    <Link href="/admin/veiculos" prefetch={false}>Voltar à frota</Link>
    {context.role !== "owner" ? <p>Somente a conta proprietária pode gerenciar fotos.</p>
      : result?.status === "ready" ? <VehicleMediaManager vehicleId={vehicleId} images={result.images} />
      : <p role="alert">Não foi possível carregar as fotos deste veículo.</p>}
  </CentralShell>;
}
