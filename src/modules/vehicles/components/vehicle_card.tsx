import Image from "next/image";
import Link from "next/link";
import type { Vehicle } from "@/types/vehicle";
import { formatRentalMoney, rentalTerms } from "@/modules/rentals/domain/rental_terms";

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  return <article className="vehicle-card demo-vehicle-card">
    <div className="vehicle-image"><Image src={vehicle.image.src} alt={vehicle.image.alt} fill sizes="(max-width: 599px) calc(100vw - 40px), (max-width: 1199px) 44vw, 280px" className="vehicle-photo" /><span>Imagem ilustrativa</span></div>
    <div className="card-content">
      <div className="card-heading"><div><p className="eyebrow">Demonstração</p><h3>{vehicle.model}</h3></div><span className={`status ${vehicle.acceptsInterest ? "status-available" : "status-unavailable"}`}>{vehicle.availabilityLabel}</span></div>
      <dl className="vehicle-details"><div><dt>Ano</dt><dd>{vehicle.year ?? "Ano a confirmar"}</dd></div><div><dt>Cor</dt><dd>{vehicle.color}</dd></div><div><dt>Câmbio</dt><dd>{vehicle.transmission}</dd></div><div><dt>Característica informada</dt><dd>{vehicle.feature}</dd></div></dl>
      <p className="price"><strong>{formatRentalMoney(rentalTerms.weeklyRentalCents)}</strong> <span>/ semana</span><small>Valor demonstrativo</small></p>
      <div className="card-actions">{vehicle.acceptsInterest ? <Link href={`/interesse?vehicle=${vehicle.id}`} className="button primary">Tenho interesse</Link> : <span className="button button-disabled" aria-disabled="true">Interesse indisponível</span>}<Link href={`/veiculos/${vehicle.id}`} className="button secondary">Ver detalhes</Link></div>
    </div>
  </article>;
}
