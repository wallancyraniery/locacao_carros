import "server-only";

import { availabilityQuerySchema } from "../domain/availability_period";
import type { AvailabilityRepository } from "../domain/availability_repository";

export async function checkAvailability(
  repository: AvailabilityRepository,
  input: unknown,
): Promise<boolean> {
  const parsed = availabilityQuerySchema.safeParse(input);
  if (!parsed.success) return false;
  try {
    return (await repository.isAvailable(parsed.data)) === true;
  } catch {
    return false;
  }
}
