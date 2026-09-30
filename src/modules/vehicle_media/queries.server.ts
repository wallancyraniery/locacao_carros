import "server-only";
import { z } from "zod";
import { createStorefrontClient } from "@/modules/storefront/client.server";
import type { PublicMediaRecord, SignedVehicleImage } from "./contracts";
import {
  MEDIA_READ_TTL_SECONDS,
  VEHICLE_MEDIA_BUCKET,
  imageIdSchema,
  storagePathSchema,
} from "./validation";
import { validateMediaStorageUrl } from "./storage_url.server";

const publicMediaRecordSchema = z.object({
  id: imageIdSchema,
  storage_path: storagePathSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  position: z.number().int().min(0).max(7),
}).strict();

type SignPublicMediaResult =
  | { status: "ready"; images: SignedVehicleImage[] }
  | { status: "error" };

export async function signPublicMedia(records: PublicMediaRecord[]): Promise<SignPublicMediaResult> {
  if (records.length === 0) return { status: "ready", images: [] };

  const parsed = z.array(publicMediaRecordSchema).max(24).safeParse(records);
  if (!parsed.success) return { status: "error" };

  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const record of parsed.data) {
    if (ids.has(record.id) || paths.has(record.storage_path)) return { status: "error" };
    ids.add(record.id);
    paths.add(record.storage_path);
  }

  try {
    const storage = createStorefrontClient().storage.from(VEHICLE_MEDIA_BUCKET);
    const images = await Promise.all(parsed.data.map(async (record): Promise<SignedVehicleImage> => {
      const { data, error } = await storage.createSignedUrl(record.storage_path, MEDIA_READ_TTL_SECONDS);
      if (error || !data?.signedUrl) throw new Error("Falha ao assinar mídia pública.");
      return {
        id: record.id,
        url: validateMediaStorageUrl(data.signedUrl, record.storage_path, "read"),
        width: record.width,
        height: record.height,
        position: record.position,
      };
    }));

    return { status: "ready", images };
  } catch {
    return { status: "error" };
  }
}
