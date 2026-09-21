import type { AvailabilityQuery } from "./availability_period";

export type AvailabilityRepository = {
  isAvailable(query: AvailabilityQuery): Promise<boolean>;
};
