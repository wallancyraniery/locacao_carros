export function validateSeedCatalog(vehicles) {
  if (vehicles.some((vehicle) => !Number.isInteger(vehicle.year))) {
    throw new Error("Seed recusado: existem veículos sem ano confirmado.");
  }

  if (vehicles.some((vehicle) => !vehicle.status)) {
    throw new Error("Seed recusado: existem veículos sem disponibilidade confirmada.");
  }
}
