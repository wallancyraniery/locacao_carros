import "server-only";
import sharp from "sharp";
import type { ImageMimeType } from "./contracts";
import { MAX_VEHICLE_IMAGE_BYTES, matchesImageSignature } from "./validation";

// Decoder safety limits, not commercial restrictions. Bound decompressed memory
// and reject animation/multiple pages rather than silently changing the original.
export const MAX_DECODED_IMAGE_PIXELS = 25_000_000;
export const MAX_IMAGE_DIMENSION = 16_384;

export async function inspectVehicleImageFile(blob: Blob, mimeType: ImageMimeType, expectedSize: number) {
  if (blob.size !== expectedSize || blob.size <= 0 || blob.size > MAX_VEHICLE_IMAGE_BYTES) throw new Error("Imagem inválida.");
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (!matchesImageSignature(bytes, mimeType)) throw new Error("Imagem inválida.");
  const options = { failOn: "warning" as const, limitInputPixels: MAX_DECODED_IMAGE_PIXELS, sequentialRead: true };
  const metadata = await sharp(bytes, options).metadata();
  const expectedFormat = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" }[mimeType];
  const { width, height } = metadata;
  if (metadata.format !== expectedFormat || !width || !height || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION
    || width * height > MAX_DECODED_IMAGE_PIXELS || (metadata.pages ?? 1) !== 1) throw new Error("Imagem inválida.");
  // metadata() alone does not decode the body. Decode every pixel, then discard
  // it; the original stored object is never transformed or replaced.
  const decoded = await sharp(bytes, options).raw().toBuffer({ resolveWithObject: true });
  if (decoded.info.width !== width || decoded.info.height !== height) throw new Error("Imagem inválida.");
  return { mimeType, byteSize: bytes.length, width, height };
}
