import "server-only";
import { z } from "zod";
import { createStorefrontClient } from "./client.server";
import { signPublicMedia } from "@/modules/vehicle_media/queries.server";
import { storefrontSchema, storefrontDetailSchema, storefrontInterestPrivacySchema, storefrontSlug, type Storefront, type StorefrontDetail } from "./contracts";
import { parseConfiguredPrivacyNotice, type PrivacyNoticeConfiguration } from "@/config/privacy_notice_environment";

type Result = { status: "ready"; storefront: Storefront } | { status: "missing" | "error" };
export async function loadStorefront(slug: string, page = 1): Promise<Result> {
  if (!storefrontSlug.safeParse(slug).success || !Number.isInteger(page) || page < 1 || page > 10000) return { status: "missing" };
  try {
    // The 0013 RPC is kept intact for rollback; media uses its own public projection.
    const { data, error } = await createStorefrontClient().rpc("lookup_tenant_storefront_media", { p_slug: slug, p_page: page });
    if (error) return { status: "error" };
    if (data === null) return { status: "missing" };
    const parsed = storefrontSchema.safeParse(data);
    if (!parsed.success || parsed.data.slug !== slug) return { status: "error" };
    // Only covers are delivered on the listing. The detail signs the ordered gallery.
    const covers = parsed.data.vehicles.flatMap((vehicle) => vehicle.images.slice(0, 1));
    const signed = await signPublicMedia(covers);
    if (signed.status !== "ready") return { status: "error" };
    const images = new Map(signed.images.map((image) => [image.id, image]));
    if (covers.some((cover) => !images.has(cover.id))) return { status: "error" };
    return { status: "ready", storefront: { ...parsed.data, vehicles: parsed.data.vehicles.map((vehicle) => ({
      ...vehicle, images: vehicle.images.length ? [images.get(vehicle.images[0].id)!] : [],
    })) } };
  } catch {
    return { status: "error" };
  }
}

export async function loadStorefrontVehicle(slug: string, vehicleId: string): Promise<
  { status: "ready"; storefront: StorefrontDetail } | { status: "missing" | "error" }
> {
  if (!storefrontSlug.safeParse(slug).success || !z.uuid().safeParse(vehicleId).success) return { status: "missing" };
  try {
    const { data, error } = await createStorefrontClient().rpc("lookup_tenant_storefront_vehicle", { p_slug: slug, p_vehicle_id: vehicleId });
    if (error) return { status: "error" };
    if (data === null) return { status: "missing" };
    const parsed = storefrontDetailSchema.safeParse(data);
    if (!parsed.success || parsed.data.slug !== slug || parsed.data.vehicle.id !== vehicleId) return { status: "error" };
    const signed = await signPublicMedia(parsed.data.vehicle.images);
    if (signed.status !== "ready") return { status: "error" };
    if (signed.images.length !== parsed.data.vehicle.images.length
      || signed.images.some((image, index) => image.id !== parsed.data.vehicle.images[index].id)) return { status: "error" };
    return { status: "ready", storefront: { ...parsed.data, vehicle: { ...parsed.data.vehicle, images: signed.images } } };
  } catch {
    return { status: "error" };
  }
}

export async function loadStorefrontInterestPrivacy(slug: string, vehicleId: string): Promise<
  { status: "ready"; configuration: Extract<PrivacyNoticeConfiguration, { mode: "configured" }> } | { status: "missing" | "error" }
> {
  if (!storefrontSlug.safeParse(slug).success || !z.uuid().safeParse(vehicleId).success) return { status: "missing" };
  try {
    const { data, error } = await createStorefrontClient().rpc("lookup_tenant_storefront_interest_privacy", { p_slug: slug, p_vehicle_id: vehicleId });
    if (error) return { status: "error" };
    if (data === null) return { status: "missing" };
    const parsed = storefrontInterestPrivacySchema.safeParse(data);
    if (!parsed.success) return { status: "error" };
    const configuration = parseConfiguredPrivacyNotice({
      PRIVACY_CONTROLLER_NAME: parsed.data.data_controller,
      PRIVACY_CONTACT_LABEL: parsed.data.privacy_channel_label,
      PRIVACY_CONTACT_URL: parsed.data.privacy_channel_url,
    });
    return configuration ? { status: "ready", configuration } : { status: "error" };
  } catch {
    return { status: "error" };
  }
}
