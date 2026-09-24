import Link from "next/link";
import { requireCentralContext } from "@/modules/central/access.server";
import { CentralShell, CentralError } from "@/modules/central/shell";
import { loadFleetSummary } from "@/modules/fleet/queries.server";

export default async function AdminPage() {
  const context = await requireCentralContext();
  if (context.status !== "ready") return <CentralError />;
  const summary = await loadFleetSummary(context.client);
  return <CentralShell title="Visão geral" current="/admin" name={context.organization.name} email={context.email} role={context.role}>
    <p>Acompanhe a frota da sua locadora e consulte os interessados recebidos.</p>
    {summary.status === "error" ? <p role="alert">Não foi possível consultar a frota agora.</p> :
      <dl className="central-metrics"><div><dt>Veículos ativos</dt><dd>{summary.active}</dd></div><div><dt>Veículos inativos</dt><dd>{summary.inactive}</dd></div></dl>}
    <p>Os números incluem somente veículos cadastrados na frota, sem os demonstrativos. Estado ativo não garante disponibilidade em um período.</p>
    <Link className="button primary" href="/admin/veiculos" prefetch={false}>Ver minha frota</Link>
  </CentralShell>;
}
