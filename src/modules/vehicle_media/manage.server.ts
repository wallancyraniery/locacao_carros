import "server-only";
import { z } from "zod";
import { loadCentralContext } from "@/modules/central/access.server";
import { mediaMetadataSchema, imageIdSchema, VEHICLE_MEDIA_BUCKET, MEDIA_READ_TTL_SECONDS } from "./validation";
import { validateMediaStorageUrl } from "./storage_url.server";

export async function mediaContext(vehicleId: string) {
  if (!imageIdSchema.safeParse(vehicleId).success) throw new Error("Veículo inválido.");
  const context = await loadCentralContext();
  if (context.status !== "ready" || context.role !== "owner") throw new Error("Acesso indisponível.");
  return context;
}
export async function mediaRecords(context: Awaited<ReturnType<typeof mediaContext>>, vehicleId: string) {
  const { data, error } = await context.client.rpc("list_vehicle_media", { p_vehicle_id: vehicleId });
  if (error) throw new Error("Mídia indisponível.");
  const records = z.array(mediaMetadataSchema).max(8).parse(data);
  if (records.some((image) => image.vehicle_id !== vehicleId)) throw new Error("Mídia inválida.");
  return records;
}
export async function loadManagedMedia(vehicleId: string) {
  try {
    const context = await mediaContext(vehicleId);
    const records = await mediaRecords(context, vehicleId);
    const images = await Promise.all(records.map(async (record) => {
      let url: string | null = null;
      if (record.status === "ready") {
        const result = await context.client.storage.from(VEHICLE_MEDIA_BUCKET).createSignedUrl(record.storage_path, MEDIA_READ_TTL_SECONDS);
        if (result.error || !result.data) throw new Error("Mídia indisponível.");
        url = validateMediaStorageUrl(result.data.signedUrl, record.storage_path, "read");
      }
      return { id: record.id, status: record.status, position: record.position, url };
    }));
    return { status: "ready" as const, images };
  } catch { return { status: "error" as const }; }
}
