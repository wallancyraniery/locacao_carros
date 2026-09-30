import "server-only";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/modules/database/client.server";

export async function finishMedia(actor: string, vehicleId: string, imageId: string, remove: boolean, width: number | null = null, height: number | null = null) {
  await getDatabase().execute(sql`select vehicle_media_private.finish(
    ${actor}::uuid, ${vehicleId}::uuid, ${imageId}::uuid, ${remove}::boolean, ${width}::integer, ${height}::integer)`);
}
