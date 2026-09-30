import "server-only";
import { parseAdminAuthEnvironment } from "@/config/admin_auth_environment";
import { VEHICLE_MEDIA_BUCKET, storagePathSchema } from "./validation";

export function validateMediaStorageUrl(value: string, path: string, operation: "upload" | "read"): string {
  const environment = parseAdminAuthEnvironment(process.env);
  if (!storagePathSchema.safeParse(path).success) throw new Error("Resposta de mídia inválida.");
  const url = new URL(value);
  const prefix = operation === "upload" ? "object/upload/sign" : "object/sign";
  if (url.origin !== environment.url || url.username || url.password || url.hash
    || decodeURIComponent(url.pathname) !== `/storage/v1/${prefix}/${VEHICLE_MEDIA_BUCKET}/${path}`
    || !url.searchParams.get("token") || Array.from(url.searchParams.keys()).some((key) => key !== "token")) {
    throw new Error("Resposta de mídia inválida.");
  }
  return url.toString();
}
