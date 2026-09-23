import Link from "next/link";
import { requireCentralContext } from "@/modules/central/access.server";
import { CentralShell, CentralError } from "@/modules/central/shell";
import { loadFleet } from "@/modules/fleet/queries.server";

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const context = await requireCentralContext();
  if (context.status !== "ready") return <CentralError />;
  const params = await searchParams;
  const page = typeof params.page === "string" && /^[1-9]\d{0,4}$/.test(params.page) ? Number(params.page) : 1;
  const result = await loadFleet(context.client, page);
  return <CentralShell title="Veículos" current="/admin/veiculos" name={context.organization.name}>
    <p>Frota da sua locadora. Veículos demonstrativos não aparecem nesta lista.</p>
    {context.role === "owner" ? <Link className="button primary" href="/admin/veiculos/novo" prefetch={false}>Cadastrar veículo</Link> : <p>Somente a conta proprietária pode cadastrar veículos.</p>}
    {result.status === "error" ? <p role="alert">Não foi possível carregar os veículos. Tente novamente em instantes.</p> : <>
      {result.vehicles.length === 0 ? <p>Nenhum veículo nesta página.</p> : <div className="admin-table-scroll"><table className="admin-table"><caption>Veículos da sua locadora</caption>
        <thead><tr>{["Veículo", "Ano", "Cor", "Valor semanal", "Estado operacional", "Imagem"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{result.vehicles.map((vehicle) => <tr key={vehicle.id}><td>{[vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" ")}</td><td>{vehicle.year}</td><td>{vehicle.color}</td>
          <td>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(vehicle.weekly_price_cents / 100)}</td><td>{vehicle.operational_status === "active" ? "Ativo" : "Inativo"}</td><td>Sem foto</td></tr>)}</tbody>
      </table></div>}
      <nav aria-label="Páginas de veículos" className="admin-pagination">{page > 1 && <Link prefetch={false} href={`/admin/veiculos?page=${page - 1}`}>Anterior</Link>}<span>Página {page}</span>{result.hasNext && <Link prefetch={false} href={`/admin/veiculos?page=${page + 1}`}>Próxima</Link>}</nav>
    </>}
  </CentralShell>;
}
