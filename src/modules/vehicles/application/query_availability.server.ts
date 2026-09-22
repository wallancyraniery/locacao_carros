import "server-only";

import { availabilityQuerySchema } from "../domain/availability_period";
import type { AvailabilityRepository } from "../domain/availability_repository";

export type AvailabilityResult =
  | { status: "available" }
  | { status: "unavailable" }
  | { status: "invalid" }
  | { status: "error" };

export async function queryAvailability(
  repository: AvailabilityRepository,
  input: unknown,
): Promise<AvailabilityResult> {
  const parsed = availabilityQuerySchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  try {
    const available = await repository.isAvailable(parsed.data);
    return { status: available === true ? "available" : "unavailable" };
  } catch {
    return { status: "error" };
  }
}
