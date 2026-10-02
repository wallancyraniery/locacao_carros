import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImproveBrand } from "@/modules/ui/brand";
import { VehiclePlaceholder } from "@/modules/ui/empty_state";
import { formatRentalMoney } from "@/modules/rentals/domain/rental_terms";
import { loadStorefrontVehicle } from "@/modules/storefront/queries.server";
import { loadCentralContext } from "@/modules/central/access.server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Veículo | Improve", description: "Conheça o veículo apresentado pela locadora." };

export default async function StorefrontVehiclePage({ params, searchParams }: {
  params: Promise<{ slug: string; vehicleId: string }>;
  searchParams: Promise<{ preview?: string | string[] }>;
}) {
  const { slug, vehicleId } = await params;
  const query = await searchParams;
  const result = await loadStorefrontVehicle(slug, vehicleId);
  if (result.status === "missing") notFound();
  if (result.status === "error") return <main className="section"><h1>Consulta do veículo</h1><p role="alert">Não foi possível consultar este veículo agora. Tente novamente em instantes.</p></main>;
  if (result.status !== "ready") return null;

  const { vehicle, ...org } = result.storefront;
  const previewRequested = query.preview === "central";
  const context = previewRequested ? await loadCentralContext() : null;
  const centralPreview = context?.status === "ready" && context.organization.slug === org.slug;
  const previewSuffix = centralPreview ? "?preview=central" : "";
  return <>
    <header className="storefront-topbar"><Link className="storefront-nav storefront-back" href={`/locadoras/${org.slug}${previewSuffix}`}>← Voltar à frota</Link><ImproveBrand subtle /></header>
    {centralPreview && <nav className="storefront-preview" aria-label="Pré-visualização da Central"><span>Pré-visualização da sua vitrine</span><div><Link href="/admin">Visão geral</Link><Link href="/admin/veiculos">Veículos</Link><Link href="/admin/reservas">Reservas</Link><Link href="/admin/interessados">Interessados</Link><Link href="/admin/locadora">Minha locadora</Link></div></nav>}
    <main className="section storefront storefront-detail-page">
      <header className="storefront-heading">
        <p className="eyebrow">Veículo da frota</p>
        <h1>{vehicle.brand} {vehicle.model}</h1>
        <p className="storefront-city">{org.name}{org.city ? ` · ${org.city}` : ""}</p>
      </header>
      <div className="storefront-detail-grid">
        <section aria-label="Fotos do veículo" className="storefront-gallery">
          {vehicle.images.length > 0 ? vehicle.images.map((image, index) => <figure key={image.id}>
            <Image
              src={image.url}
              alt={`${vehicle.brand} ${vehicle.model} — foto ${index + 1}`}
              width={image.width}
              height={image.height}
              unoptimized
              className="storefront-gallery-photo"
            />
          </figure>) : <VehiclePlaceholder />}
        </section>
        <aside className="storefront-detail-summary">
          {vehicle.version && <p className="caption">{vehicle.version}</p>}
          <dl className="vehicle-details"><div><dt>Ano</dt><dd>{vehicle.year}</dd></div><div><dt>Cor</dt><dd>{vehicle.color}</dd></div></dl>
          <p className="price"><strong>{formatRentalMoney(vehicle.weekly_price_cents)}</strong> <span>/ semana</span></p>
          <p className="storefront-notice">O envio de interesse não representa reserva, aprovação ou garantia de disponibilidade. A locadora confirmará as condições.</p>
          {centralPreview
            ? <p className="button button-disabled" aria-disabled="true">Envio de interesse desativado na pré-visualização</p>
            : <Link className="button primary" href={`/interesse?storefront=${org.slug}&vehicle=${vehicle.id}`}>Tenho interesse</Link>}
        </aside>
      </div>
    </main>
  </>;
}
