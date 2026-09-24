import { ImproveBrand } from "@/modules/ui/brand";
import { Icon } from "@/modules/ui/icon";
import { EmptyState, VehiclePlaceholder } from "@/modules/ui/empty_state";
import { notFound } from "next/navigation";
import { loadStorefront } from "@/modules/storefront/queries.server";
import { formatRentalMoney } from "@/modules/rentals/domain/rental_terms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Locadora | Improve", description: "Conheça a locadora e os veículos apresentados por ela." };

export default async function StorefrontPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const page = query.page === undefined ? 1 : typeof query.page === "string" && /^[1-9][0-9]{0,4}$/.test(query.page) ? Number(query.page) : 0;
  const result = await loadStorefront(slug, page);
  if (result.status === "missing") notFound();
  if (result.status === "error") return <main className="section"><h1>Consulta da locadora</h1><p role="alert">Não foi possível consultar esta página agora. Tente novamente em instantes.</p></main>;
  if (result.status !== "ready") return null;
  const org = result.storefront;
  return <>
    <header className="storefront-topbar"><span>Frota da locadora</span><ImproveBrand subtle /></header>
    <main className="section storefront">
      <header className="storefront-heading"><p className="eyebrow">Conheça nossa frota</p><h1>{org.name}</h1><p className="storefront-city"><Icon name="pin" />{org.city || "Cidade não informada"}</p></header>
      <div className="storefront-section-heading"><h2>Veículos</h2><span className="caption">Valores por semana</span></div>
      <p className="storefront-notice">Valores semanais informados pela locadora. A exposição do veículo não confirma disponibilidade para um período. Solicitações por esta página ainda não estão disponíveis.</p>
      {org.vehicles.length === 0 ? <EmptyState>Nenhum veículo para exibir nesta página.</EmptyState> : <div className="vehicle-grid storefront-grid">{org.vehicles.map((vehicle, index) => <article className="vehicle-card storefront-card" key={index}>
        <VehiclePlaceholder />
        <div className="card-content"><div className="storefront-card-heading"><h3>{vehicle.brand} {vehicle.model}</h3>
          {vehicle.version && <p>{vehicle.version}</p>}</div>
          <dl className="vehicle-details"><div><dt>Ano</dt><dd>{vehicle.year}</dd></div><div><dt>Cor</dt><dd>{vehicle.color}</dd></div></dl>
          <p className="price"><strong>{formatRentalMoney(vehicle.weekly_price_cents)}</strong> <span>/ semana</span></p>
        </div>
      </article>)}</div>}
      <nav className="storefront-pagination" aria-label="Páginas de veículos">
        {page > 1 && <a href={`/locadoras/${org.slug}?page=${page - 1}`}>Anterior</a>}
        {org.hasNext && page < 10000 && <a href={`/locadoras/${org.slug}?page=${page + 1}`}>Próxima</a>}
      </nav>
    </main>
  </>;
}
