import { z } from "zod";
import type { ImageMimeType } from "./contracts";

export const VEHICLE_MEDIA_BUCKET = "vehicle-media";
export const MAX_VEHICLE_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VEHICLE_IMAGES = 8;
export const MEDIA_READ_TTL_SECONDS = 300;
export const imageIdSchema = z.uuid();
export const imageMimeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);
export const imageUploadInputSchema = z.object({
  mimeType: imageMimeSchema,
  byteSize: z.number().int().positive().max(MAX_VEHICLE_IMAGE_BYTES),
}).strict();
export const imageOrderSchema = z.array(imageIdSchema).max(MAX_VEHICLE_IMAGES)
  .refine((ids) => new Set(ids).size === ids.length);

const uuidPath = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const storagePathSchema = z.string().regex(new RegExp(`^${uuidPath}/${uuidPath}/${uuidPath}\\.(jpg|png|webp)$`));
export const mediaMetadataSchema = z.object({
  id: imageIdSchema, vehicle_id: imageIdSchema, storage_path: storagePathSchema,
  status: z.enum(["prepared", "ready", "deleting", "deleted"]),
  position: z.number().int().min(0).max(7).nullable(), mime_type: imageMimeSchema,
  byte_size: z.number().int().positive().max(MAX_VEHICLE_IMAGE_BYTES),
  expires_at: z.string().nullable(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
});
export type MediaMetadata = z.infer<typeof mediaMetadataSchema>;

export function canonicalMediaPath(organizationId: string, vehicleId: string, imageId: string, mimeType: z.infer<typeof imageMimeSchema>) {
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[mimeType];
  return `${organizationId}/${vehicleId}/${imageId}.${extension}`;
}

export function matchesImageSignature(bytes: Uint8Array, mimeType: ImageMimeType) {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  return bytes.length >= 12 && [82, 73, 70, 70].every((byte, index) => bytes[index] === byte)
    && [87, 69, 66, 80].every((byte, index) => bytes[index + 8] === byte);
}
