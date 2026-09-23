import { z } from "zod";

export const storefrontSlug = z.string().min(3).max(63).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export const storefrontSchema = z.object({
  slug: storefrontSlug,
  name: z.string().min(1),
  city: z.string().nullable(),
  vehicles: z.array(z.object({
    brand: z.string(), model: z.string(), version: z.string().nullable(),
    year: z.number().int().min(1900).max(2200), color: z.string(),
    weekly_price_cents: z.number().int().nonnegative(),
  }).strict()).max(24),
  hasNext: z.boolean(),
}).strict();
export type Storefront = z.infer<typeof storefrontSchema>;
