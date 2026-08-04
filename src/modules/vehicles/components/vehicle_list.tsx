import { vehicles } from "../data/vehicles";
import { VehicleCard } from "./vehicle_card";

export function VehicleList() { return <div className="vehicle-grid" aria-label="Veículos demonstrativos">{vehicles.map((vehicle) => <div id={`veiculo-${vehicle.id}`} key={vehicle.id}><VehicleCard vehicle={vehicle} /></div>)}</div>; }
