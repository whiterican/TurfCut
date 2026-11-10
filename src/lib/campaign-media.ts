import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/env";

// The image check itself is shared, not social (profile photos use it too): lib/image-clean.
export { checkImage, MEDIA_MAX_BYTES, stripJpegMetadata, stripPngMetadata } from "@/lib/image-clean";

/**
 * Campaign avatars and header images (S1) live in a PUBLIC Supabase Storage
 * bucket: they're shown on a public page. Only the server writes to it
 * (service role), after the campaign staff check. Every file is public by
 * its (unguessable) address from the moment it's uploaded, draft or not.
 * Setup (README, S1): create the bucket "campaign-media" as public, with a
 * 2 MB file size limit and allowed types image/png and image/jpeg.
 */
export const MEDIA_BUCKET = "campaign-media";

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
      // An hour of caching: a removed image stops showing soon after, not a year later.
      const { error } = await bucket().upload(key, bytes, { contentType: type, upsert: false, cacheControl: "3600" });
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
