import type { Vehicle } from "@/types/vehicle";
import { getVehicleStatusLabel } from "../lib/status";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  return <article className="vehicle-card">
    <div className="vehicle-art" aria-hidden="true"><span className="car-body" /><span className="wheel wheel-one" /><span className="wheel wheel-two" /></div>
    <div className="card-content">
      <div className="card-heading"><div><p className="eyebrow">Veículo demonstrativo</p><h3>{vehicle.model}</h3></div><span className={`status status-${vehicle.status}`}>{getVehicleStatusLabel(vehicle.status)}</span></div>
      <dl><div><dt>Ano</dt><dd>{vehicle.year}</dd></div><div><dt>Cor</dt><dd>{vehicle.color}</dd></div></dl>
      <p className="price"><strong>{money.format(vehicle.weeklyPrice)}</strong> por semana</p>
      <div className="card-actions"><button type="button" className="button secondary">Ver detalhes</button>{vehicle.status === "available" && <button type="button" className="button primary">Tenho interesse</button>}</div>
    </div>
  </article>;
}
