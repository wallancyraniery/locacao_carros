import { z } from "zod";

const label = (max: number) => z.string().trim().min(1).max(max).refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), "Texto inválido");
export const vehicleInputSchema = z.object({
  operationId: z.uuid(), brand: label(80), model: label(120),
  version: z.union([z.literal(""), label(120)]).transform((value) => value || null),
  year: z.string().regex(/^\d{4}$/).transform(Number).pipe(z.number().int().min(1900).max(2200)),
  color: label(60),
  weeklyPrice: z.string().regex(/^\d{1,8}([,.]\d{1,2})?$/).transform((value) => {
    const [whole, fraction = ""] = value.replace(",", ".").split(".");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  }).pipe(z.number().int().min(0).max(2147483647)),
  operationalStatus: z.enum(["active", "inactive"]),
});
