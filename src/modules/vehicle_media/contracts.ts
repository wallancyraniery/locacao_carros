export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";
export type VehicleImageStatus = "prepared" | "ready" | "deleting" | "deleted";
export type MediaFailure = { status: "error"; message: string };
export type MediaActionResult = { status: "success" } | MediaFailure;
export type PrepareMediaResult =
  | { status: "prepared"; imageId: string; uploadUrl: string; publishableKey: string }
  | { status: "ready"; imageId: string }
  | MediaFailure;
export type SignedVehicleImage = { id: string; url: string; width: number; height: number; position: number };
export type VehicleMediaItem = {
  id: string; status: VehicleImageStatus; position: number | null; mimeType: ImageMimeType;
  byteSize: number; width: number | null; height: number | null; url: string | null;
};
export type PublicMediaRecord = { id: string; storage_path: string; width: number; height: number; position: number };
