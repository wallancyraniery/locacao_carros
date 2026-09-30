import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImproveBrand } from "@/modules/ui/brand";
import { VehiclePlaceholder } from "@/modules/ui/empty_state";
import { formatRentalMoney } from "@/modules/rentals/domain/rental_terms";
import { loadStorefrontVehicle } from "@/modules/storefront/queries.server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Veículo | Improve", description: "Conheça o veículo apresentado pela locadora." };

export default async function StorefrontVehiclePage({ params }: {
  params: Promise<{ slug: string; vehicleId: string }>;
}) {
  const { slug, vehicleId } = await params;
  const result = await loadStorefrontVehicle(slug, vehicleId);
  if (result.status === "missing") notFound();
  if (result.status === "error") return <main className="section"><h1>Consulta do veículo</h1><p role="alert">Não foi possível consultar este veículo agora. Tente novamente em instantes.</p></main>;
  if (result.status !== "ready") return null;

  const { vehicle, ...org } = result.storefront;
  return <>
    <header className="storefront-topbar"><nav className="storefront-nav" aria-label="Navegação da vitrine"><Link href="/">Início</Link><Link className="storefront-back" href={`/locadoras/${org.slug}`}>← Voltar à frota</Link></nav><ImproveBrand subtle /></header>
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
          <p className="storefront-notice">A exibição do veículo não confirma disponibilidade para um período. Solicitações por esta página ainda não estão disponíveis.</p>
        </aside>
      </div>
    </main>
  </>;
}
