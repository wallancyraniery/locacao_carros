import { HomePage } from "@/modules/marketing/components/home_page";
import { loadVehicleCatalog } from "@/modules/vehicles/infrastructure/catalog_availability.server";

export const dynamic = "force-dynamic";

export default async function Page() { return <HomePage vehicles={await loadVehicleCatalog()} />; }
