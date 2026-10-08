import Image from "next/image";
import Link from "next/link";
import { ImproveBrand } from "@/modules/ui/brand";
import { Icon } from "@/modules/ui/icon";
import { EmptyState, VehiclePlaceholder } from "@/modules/ui/empty_state";
import { notFound } from "next/navigation";
import { loadStorefront } from "@/modules/storefront/queries.server";
import { loadCentralContext } from "@/modules/central/access.server";
import { formatRentalMoney } from "@/modules/rentals/domain/rental_terms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Locadora | Improve", description: "Conheça a locadora e os veículos apresentados por ela." };

export default async function StorefrontPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[]; preview?: string | string[] }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const page = query.page === undefined ? 1 : typeof query.page === "string" && /^[1-9][0-9]{0,4}$/.test(query.page) ? Number(query.page) : 0;
  const result = await loadStorefront(slug, page);
  if (result.status === "missing") notFound();
  if (result.status === "error") return <main className="section"><h1>Consulta da locadora</h1><p role="alert">Não foi possível consultar esta página agora. Tente novamente em instantes.</p></main>;
  if (result.status !== "ready") return null;
  const org = result.storefront;
  const previewRequested = query.preview === "central";
  const context = previewRequested ? await loadCentralContext() : null;
  const centralPreview = context?.status === "ready" && context.organization.slug === org.slug;
  const previewSuffix = centralPreview ? "?preview=central" : "";
  return <div className="tenant-storefront">
    <header className="storefront-topbar"><div className="storefront-topbar-identity"><strong>{org.name}</strong><span className="storefront-nav" aria-current="page">Frota</span></div><ImproveBrand subtle /></header>
    {centralPreview && <nav className="storefront-preview" aria-label="Pré-visualização da Central"><span>Pré-visualização da sua vitrine</span><div><Link href="/admin">Visão geral</Link><Link href="/admin/veiculos">Veículos</Link><Link href="/admin/reservas">Reservas</Link><Link href="/admin/interessados">Interessados</Link><Link href="/admin/locadora">Minha locadora</Link></div></nav>}
    <main className="section storefront">
      <header className="storefront-heading storefront-hero"><div className="storefront-hero-copy"><p className="eyebrow">Conheça nossa frota</p><h1>{org.name}</h1><p className="storefront-city"><Icon name="pin" />{org.city || "Cidade não informada"}</p><p className="storefront-hero-lead">Conheça os veículos desta locadora e manifeste seu interesse diretamente pela página.</p><a className="button secondary storefront-hero-action" href="#frota">Explorar veículos <span aria-hidden="true">↘</span></a></div></header>
      <div className="storefront-section-heading" id="frota"><div><p className="eyebrow">Explore a frota</p><h2>Veículos</h2></div><span className="caption">Valores por semana</span></div>
      <p className="storefront-notice">Valores semanais informados pela locadora. A exposição do veículo não confirma disponibilidade para um período. No detalhe, você pode manifestar interesse; a locadora confirmará as condições.</p>
      {org.vehicles.length === 0 ? <EmptyState>Nenhum veículo para exibir nesta página.</EmptyState> : <div className="vehicle-grid storefront-grid">{org.vehicles.map((vehicle) => {
        const cover = vehicle.images[0];
        return <article className="vehicle-card storefront-card" key={vehicle.id}>
          {cover ? <div className="storefront-vehicle-media">
            <Image
              src={cover.url}
              alt={`${vehicle.brand} ${vehicle.model}`}
              width={cover.width}
              height={cover.height}
              unoptimized
              className="storefront-vehicle-photo"
            />
          </div> : <VehiclePlaceholder />}
          <div className="card-content"><div className="storefront-card-heading"><h3>{vehicle.brand} {vehicle.model}</h3>
            {vehicle.version && <p>{vehicle.version}</p>}</div>
            <dl className="vehicle-details"><div><dt>Ano</dt><dd>{vehicle.year}</dd></div><div><dt>Cor</dt><dd>{vehicle.color}</dd></div></dl>
            <p className="price"><strong>{formatRentalMoney(vehicle.weekly_price_cents)}</strong> <span>/ semana</span></p>
            <div className="card-actions"><Link className="button secondary" href={`/locadoras/${org.slug}/veiculos/${vehicle.id}${previewSuffix}`}>Ver detalhes e fotos</Link></div>
          </div>
        </article>;
      })}</div>}
      <nav className="storefront-pagination" aria-label="Páginas de veículos">
        {page > 1 && <Link href={`/locadoras/${org.slug}?page=${page - 1}${centralPreview ? "&preview=central" : ""}`}>Anterior</Link>}
        {org.hasNext && page < 10000 && <Link href={`/locadoras/${org.slug}?page=${page + 1}${centralPreview ? "&preview=central" : ""}`}>Próxima</Link>}
      </nav>
    </main>
  </div>;
}
