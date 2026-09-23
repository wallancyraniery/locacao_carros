import Link from "next/link";
import { requireCentralContext } from "@/modules/central/access.server";
import { CentralShell, CentralError } from "@/modules/central/shell";

export default async function ReservationsPage() {
  const context = await requireCentralContext();
  if (context.status !== "ready") return <CentralError />;
  return <CentralShell title="Reservas" current="/admin/reservas" name={context.organization.name}>
    <h2>Como funcionam as solicitações</h2>
    <p>A consulta de agenda e a gestão de reservas pela locadora ainda não estão disponíveis nesta Central. Esta página não lista solicitações nem confirma ausência de reservas.</p>
    <ul><li>Uma solicitação recebida precisa ser analisada; ela não é uma reserva aprovada.</li>
      <li>Solicitações pendentes não bloqueiam a agenda.</li><li>A aprovação depende do período e dos bloqueios existentes. Um veículo ativo pode estar ocupado.</li></ul>
    <p>O fluxo público de solicitações atende ao catálogo demonstrativo. A página pública da sua locadora apresenta a frota, mas ainda não habilita solicitações.</p>
    <Link href="/admin/interessados" prefetch={false}>Consultar interessados recebidos</Link>
  </CentralShell>;
}
