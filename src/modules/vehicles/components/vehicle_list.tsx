import { vehicles } from "../data/vehicles";
import { VehicleCard } from "./vehicle_card";

export function VehicleList() { return <div className="vehicle-grid" aria-label="Catálogo de veículos">{vehicles.map((vehicle) => <div id={`veiculo-${vehicle.id}`} className="vehicle-grid-item" key={vehicle.id}><VehicleCard vehicle={vehicle} /></div>)}</div>; }
