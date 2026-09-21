import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
});

export const availabilityQuerySchema = z.object({
  vehicleId: z.uuid(),
  pickupDate: isoDate,
  returnDate: isoDate,
}).refine(({ pickupDate, returnDate }) => pickupDate < returnDate);

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
