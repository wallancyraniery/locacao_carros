import "server-only";

import { queryAvailability } from "./query_availability.server";
import type { AvailabilityRepository } from "../domain/availability_repository";

export async function checkAvailability(
  repository: AvailabilityRepository,
  input: unknown,
): Promise<boolean> {
  return (await queryAvailability(repository, input)).status === "available";
}
