import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/env";
import { imageSize } from "@/lib/attachment-scan";

/**
 * Campaign avatars and header images (S1) live in a PUBLIC Supabase Storage
 * bucket: they're shown on a public page. Only the server writes to it
 * (service role), after the campaign staff check. Setup: create the bucket
 * "campaign-media" as public (README, S1).
 */
export const MEDIA_BUCKET = "campaign-media";
export const MEDIA_MAX_BYTES = 2 * 1024 * 1024;
const MIN_SIDE = 64;
const MAX_SIDE = 4096;

export type MediaKind = "avatar" | "header";

export interface MediaStore {
  put(key: string, bytes: Uint8Array, type: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export function supabaseMediaStore(): MediaStore {
  const bucket = () =>
    createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(MEDIA_BUCKET);
  return {
    async put(key, bytes, type) {
      const { error } = await bucket().upload(key, bytes, { contentType: type, upsert: false, cacheControl: "31536000" });
      if (error) throw new Error(`[turfcut] campaign image upload failed: ${error.message}`);
    },
    async remove(key) {
      const { error } = await bucket().remove([key]);
      if (error) console.error("[turfcut] campaign image cleanup failed", error.message);
    },
  };
}

/** The public address of a stored image (keys are written by the server only, so they're safe in a URL). */
export function mediaUrl(key: string | null): string | null {
  if (!key) return null;
  return `${getSupabaseUrl().replace(/\/+$/, "")}/storage/v1/object/public/${MEDIA_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * What an uploaded image is, judged from its bytes (never its name or the
 * browser's word): a PNG or JPEG of a sensible size, or why not.
 */
export function checkImage(bytes: Uint8Array): { ok: true; type: "image/png" | "image/jpeg"; ext: "png" | "jpg" } | { ok: false; reason: string } {
  if (bytes.length === 0) return { ok: false, reason: "Choose an image." };
  if (bytes.length > MEDIA_MAX_BYTES) return { ok: false, reason: "Images are up to 2 MB." };
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!png && !jpeg) return { ok: false, reason: "Use a PNG or JPEG image." };
  const size = imageSize(bytes);
  if (!size) return { ok: false, reason: "That image couldn't be read. Try saving it again as a PNG or JPEG." };
  if (size.width < MIN_SIDE || size.height < MIN_SIDE) return { ok: false, reason: `Images need to be at least ${MIN_SIDE} pixels on each side.` };
  if (size.width > MAX_SIDE || size.height > MAX_SIDE) return { ok: false, reason: `Images are up to ${MAX_SIDE} pixels on each side.` };
  return png ? { ok: true, type: "image/png", ext: "png" } : { ok: true, type: "image/jpeg", ext: "jpg" };
}
