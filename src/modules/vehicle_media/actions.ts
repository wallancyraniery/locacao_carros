"use server";
import { revalidatePath } from "next/cache";
import { parseAdminAuthEnvironment } from "@/config/admin_auth_environment";
import type { MediaActionResult, PrepareMediaResult } from "./contracts";
import { imageIdSchema, imageOrderSchema, imageUploadInputSchema, mediaMetadataSchema, canonicalMediaPath, VEHICLE_MEDIA_BUCKET } from "./validation";
import { mediaContext, mediaRecords } from "./manage.server";
import { signVehicleMediaUpload, removeVehicleMediaObject } from "./storage_write.server";
import { inspectVehicleImageFile } from "./inspect_file.server";
import { finishMedia } from "./runtime.server";

const failure = { status: "error" as const, message: "Não foi possível concluir. Confira o arquivo e tente novamente. São permitidas até 8 fotos JPEG, PNG ou WebP de até 5 MB." };
function refresh() { revalidatePath("/admin/veiculos", "layout"); revalidatePath("/locadoras", "layout"); }
async function actor(context: Awaited<ReturnType<typeof mediaContext>>) {
  const { data, error } = await context.client.auth.getUser();
  if (error || !data.user || data.user.is_anonymous) throw new Error("Sessão indisponível.");
  return data.user.id;
}
function assertMediaPath(context: Awaited<ReturnType<typeof mediaContext>>, vehicleId: string, record: ReturnType<typeof mediaMetadataSchema.parse>) {
  imageIdSchema.parse(context.organization.id);
  if (record.vehicle_id !== vehicleId || record.storage_path !== canonicalMediaPath(context.organization.id, vehicleId, record.id, record.mime_type)) {
    throw new Error("Mídia inválida.");
  }
}
async function removeDeletingMedia(context: Awaited<ReturnType<typeof mediaContext>>, vehicleId: string, record: ReturnType<typeof mediaMetadataSchema.parse>) {
  if (record.status !== "deleting") throw new Error("Estado de mídia inválido.");
  // Invalidate before the physical operation; a transient failure leaves a retryable tombstone.
  refresh();
  assertMediaPath(context, vehicleId, record);
  await removeVehicleMediaObject(record.storage_path);
  await finishMedia(await actor(context), vehicleId, record.id, true);
  refresh();
}
export async function prepareVehicleMedia(vehicleId: string, operationId: string, input: unknown): Promise<PrepareMediaResult> {
  try {
    const parsed = imageUploadInputSchema.parse(input);
    imageIdSchema.parse(operationId);
    const context = await mediaContext(vehicleId);
    // Listing atomically expires preparations under the vehicle lock. Clean up
    // sequentially before allocating another slot; failures remain deleting.
    for (const record of await mediaRecords(context, vehicleId)) {
      if (record.status === "deleting") await removeDeletingMedia(context, vehicleId, record);
    }
    const { data, error } = await context.client.rpc("prepare_vehicle_media", {
      p_vehicle_id: vehicleId, p_operation_id: operationId, p_mime_type: parsed.mimeType, p_byte_size: parsed.byteSize,
    });
    if (error) return failure;
    const record = mediaMetadataSchema.parse(data);
    if (record.vehicle_id !== vehicleId) return failure;
    if (record.status === "ready") return { status: "ready", imageId: record.id };
    if (record.status !== "prepared" || !record.expires_at || Date.parse(record.expires_at) <= Date.now()) return failure;
    assertMediaPath(context, vehicleId, record);
    const uploadUrl = await signVehicleMediaUpload(record.storage_path);
    return { status: "prepared", imageId: record.id,
      uploadUrl,
      publishableKey: parseAdminAuthEnvironment(process.env).publishableKey };
  } catch { return failure; }
}
export async function finalizeVehicleMedia(vehicleId: string, imageId: string): Promise<MediaActionResult> {
  try {
    imageIdSchema.parse(imageId);
    const context = await mediaContext(vehicleId);
    const record = (await mediaRecords(context, vehicleId)).find((image) => image.id === imageId);
    if (!record) return failure;
    if (record.status === "ready") return { status: "success" };
    if (record.status !== "prepared" || !record.expires_at || Date.parse(record.expires_at) <= Date.now()) return failure;
    const { data, error } = await context.client.storage.from(VEHICLE_MEDIA_BUCKET).download(record.storage_path);
    if (error || !data) return failure;
    const inspected = await inspectVehicleImageFile(data, record.mime_type, record.byte_size);
    await finishMedia(await actor(context), vehicleId, imageId, false, inspected.width, inspected.height);
    refresh();
    return { status: "success" };
  } catch { return failure; }
}
export async function deleteVehicleMedia(vehicleId: string, imageId: string): Promise<MediaActionResult> {
  try {
    imageIdSchema.parse(imageId);
    const context = await mediaContext(vehicleId);
    const { data, error } = await context.client.rpc("delete_vehicle_media", { p_vehicle_id: vehicleId, p_image_id: imageId });
    if (error) return failure;
    const record = mediaMetadataSchema.parse(data);
    if (record.vehicle_id !== vehicleId || record.id !== imageId) return failure;
    // Invalidate as soon as metadata disappears, even if physical removal fails.
    refresh();
    if (record.status === "deleted") return { status: "success" };
    if (record.status !== "deleting") return failure;
    await removeDeletingMedia(context, vehicleId, record);
    return { status: "success" };
  } catch { return failure; }
}
export async function reorderVehicleMedia(vehicleId: string, imageIds: string[]): Promise<MediaActionResult> {
  try {
    const order = imageOrderSchema.parse(imageIds);
    const context = await mediaContext(vehicleId);
    const { error } = await context.client.rpc("reorder_vehicle_media", { p_vehicle_id: vehicleId, p_image_ids: order });
    if (error) return failure;
    refresh();
    return { status: "success" };
  } catch { return failure; }
}
