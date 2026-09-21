import "server-only";

import { sql } from "drizzle-orm";
import { getDatabase } from "@/modules/database/client.server";
import type { AvailabilityRepository } from "../domain/availability_repository";

export const availabilityRepository: AvailabilityRepository = {
  async isAvailable({ vehicleId, pickupDate, returnDate }) {
    const rows = await getDatabase().execute<{ available: boolean }>(sql`
      SELECT availability_private.is_demo_vehicle_available(
        ${vehicleId}::uuid, ${pickupDate}::date, ${returnDate}::date
      ) AS available
    `);
    return rows.length === 1 && rows[0]?.available === true;
  },
};
