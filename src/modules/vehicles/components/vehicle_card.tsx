import Image from "next/image";
import Link from "next/link";
import type { Vehicle } from "@/types/vehicle";
import { formatRentalMoney, rentalTerms } from "@/modules/rentals/domain/rental_terms";

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  return <article className="vehicle-card">
    <div className="vehicle-image"><Image src={vehicle.image.src} alt={vehicle.image.alt} fill sizes="(max-width: 800px) calc(100vw - 40px), (max-width: 1200px) 44vw, 620px" className="vehicle-photo" /><span>Imagem ilustrativa</span></div>
    <div className="card-content">
      <div className="card-heading"><div><p className="eyebrow">Opção para consulta</p><h3>{vehicle.model}</h3></div><span className="status status-consultation">{vehicle.availabilityLabel}</span></div>
      <dl className="vehicle-details"><div><dt>Ano</dt><dd>{vehicle.year ?? "Ano a confirmar"}</dd></div><div><dt>Cor</dt><dd>{vehicle.color}</dd></div><div><dt>Câmbio</dt><dd>{vehicle.transmission}</dd></div><div><dt>Característica informada</dt><dd>{vehicle.feature}</dd></div></dl>
      <p className="price"><strong>{formatRentalMoney(rentalTerms.weeklyRentalCents)}</strong> por semana</p>
      <div className="card-actions"><Link href={`/veiculos/${vehicle.id}`} className="button secondary">Ver detalhes</Link><Link href={`/interesse?vehicle=${vehicle.id}`} className="button primary">Tenho interesse</Link></div>
    </div>
  </article>;
}
