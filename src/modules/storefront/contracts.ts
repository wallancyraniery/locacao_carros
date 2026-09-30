import { z } from "zod";
import type { SignedVehicleImage } from "@/modules/vehicle_media/contracts";

export const storefrontSlug = z.string().min(3).max(63).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const uuid = z.uuid();
const publicImageSchema = z.object({
  id: uuid, storage_path: z.string().max(180), position: z.number().int().min(0).max(7),
  width: z.number().int().positive(), height: z.number().int().positive(),
}).strict();
export const storefrontVehicleSchema = z.object({
  id: uuid, brand: z.string(), model: z.string(), version: z.string().nullable(),
  year: z.number().int().min(1900).max(2200), color: z.string(),
  weekly_price_cents: z.number().int().nonnegative(),
  images: z.array(publicImageSchema).max(8),
}).strict().superRefine((vehicle, context) => {
  const seen = new Set<string>();
  let previousPosition = -1;
  for (const image of vehicle.images) {
    const segments = image.storage_path.split("/");
    const file = segments[2] ?? "";
    if (segments.length !== 3 || !uuid.safeParse(segments[0]).success || segments[1] !== vehicle.id
      || !["jpg", "png", "webp"].some((extension) => file === `${image.id}.${extension}`)
      || seen.has(image.id) || image.position <= previousPosition) {
      context.addIssue({ code: "custom", message: "invalid_media_projection" });
    }
    seen.add(image.id); previousPosition = image.position;
  }
});
const organizationShape = { slug: storefrontSlug, name: z.string().min(1), city: z.string().nullable() };
export const storefrontSchema = z.object({
  ...organizationShape, vehicles: z.array(storefrontVehicleSchema).max(24), hasNext: z.boolean(),
}).strict();
export const storefrontDetailSchema = z.object({ ...organizationShape, vehicle: storefrontVehicleSchema }).strict();
export type StorefrontVehicle = Omit<z.infer<typeof storefrontVehicleSchema>, "images"> & { images: SignedVehicleImage[] };
export type Storefront = Omit<z.infer<typeof storefrontSchema>, "vehicles"> & { vehicles: StorefrontVehicle[] };
export type StorefrontDetail = Omit<z.infer<typeof storefrontDetailSchema>, "vehicle"> & { vehicle: StorefrontVehicle };
