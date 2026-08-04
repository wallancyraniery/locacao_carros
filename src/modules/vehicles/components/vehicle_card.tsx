import type { Vehicle } from "@/types/vehicle";
import { formatRentalMoney, rentalTerms } from "@/modules/rentals/domain/rental_terms";
import { getVehicleStatusLabel } from "../lib/status";

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  return <article className="vehicle-card">
    <div className="vehicle-art" aria-hidden="true"><span className="car-body" /><span className="wheel wheel-one" /><span className="wheel wheel-two" /></div>
    <div className="card-content">
      <div className="card-heading"><div><p className="eyebrow">Veículo demonstrativo</p><h3>{vehicle.model}</h3></div><span className={`status status-${vehicle.status}`}>{getVehicleStatusLabel(vehicle.status)}</span></div>
      <dl><div><dt>Ano</dt><dd>{vehicle.year}</dd></div><div><dt>Cor</dt><dd>{vehicle.color}</dd></div></dl>
      <p className="price"><strong>{formatRentalMoney(rentalTerms.weeklyRentalCents)}</strong> por semana</p>
      <div className="card-actions"><a href={`#veiculo-${vehicle.id}`} className="button secondary">Ver detalhes</a>{vehicle.status === "available" && <a href={`/interesse?vehicle=${vehicle.id}`} className="button primary">Tenho interesse</a>}</div>
    </div>
  </article>;
}
