import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
});

export const availabilityQuerySchema = z.object({
  vehicleId: z.uuid(),
  pickupDate: isoDate,
  returnDate: isoDate,
}).refine(({ pickupDate, returnDate }) => pickupDate < returnDate);

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
