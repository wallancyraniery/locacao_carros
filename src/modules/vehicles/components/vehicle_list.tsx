import { vehicles } from "../data/vehicles";
import { VehicleCard } from "./vehicle_card";

export function VehicleList() { return <div className="vehicle-grid" aria-label="Veículos demonstrativos">{vehicles.map((vehicle) => <VehicleCard key={vehicle.id} vehicle={vehicle} />)}</div>; }
