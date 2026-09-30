import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseAdminAuthEnvironment } from "@/config/admin_auth_environment";
import { VEHICLE_MEDIA_BUCKET, storagePathSchema } from "./validation";
import { validateMediaStorageUrl } from "./storage_url.server";

// Deliberately separate from both cookie-authenticated clients and PostgreSQL
// runtime. Never export this privileged client or fall back to another key.
function storageWriter() {
  const environment = parseAdminAuthEnvironment(process.env);
  const key = process.env.SUPABASE_VEHICLE_MEDIA_SECRET_KEY;
  if (!key || !/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) throw new Error("Mídia indisponível.");
  return createClient(environment.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  }).storage.from(VEHICLE_MEDIA_BUCKET);
}

// Call only after the owner RPC has authorized this canonical database path.
export async function signVehicleMediaUpload(path: string): Promise<string> {
  storagePathSchema.parse(path);
  const { data, error } = await storageWriter().createSignedUploadUrl(path, { upsert: false });
  if (error || !data || data.path !== path) throw new Error("Mídia indisponível.");
  return validateMediaStorageUrl(data.signedUrl, path, "upload");
}

export async function removeVehicleMediaObject(path: string): Promise<void> {
  storagePathSchema.parse(path);
  const { data, error } = await storageWriter().remove([path]);
  const removed = z.array(z.object({ name: z.string() })).max(1).safeParse(data);
  if (error || !removed.success || removed.data.some((object) => object.name !== path)) {
    throw new Error("Remoção indisponível.");
  }
  // This client has full visibility: [] means already absent, not a row hidden
  // by user RLS. Successful removal/absence is attested before runtime finish.
}
