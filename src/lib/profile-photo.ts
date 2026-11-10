import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/env";
import { checkImage } from "@/lib/image-clean";
import { ownsKey, photoTag, photoType } from "@/lib/profile-photo-key";

export { ownPhotoUrl, ownsKey, photoTag, photoType } from "@/lib/profile-photo-key";

/**
 * Profile photos (Caden, Nov 10 2026): anyone signed in may add a photo of
 * themself. They live in a PRIVATE Supabase Storage bucket; only the server
 * touches it (service role) and streams a photo through a signed-in route.
 * For now a photo is shown only to the person it belongs to: who else may see
 * a worker's photo is a decision still open (a photo shows race, age and
 * gender, so it stays out of anything an organization sees while hiring).
 * Nothing ranks, matches or infers anything from a photo.
 * Setup: prisma/profile-photo.sql adds the column and creates the bucket.
 */
export const PHOTO_BUCKET = "profile-photos";

export interface PhotoStore {
  put(key: string, bytes: Uint8Array, type: string): Promise<void>;
  /** The stored bytes, or null when there is no such file. */
  get(key: string): Promise<Uint8Array | null>;
  /** Removing a file that is already gone is fine; any other failure throws. */
  remove(key: string): Promise<void>;
}

export function supabasePhotoStore(): PhotoStore {
  const bucket = () =>
    createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(PHOTO_BUCKET);
  return {
    async put(key, bytes, type) {
      const { error } = await bucket().upload(key, bytes, { contentType: type, upsert: false });
      if (error) throw new Error(`[turfcut] profile photo upload failed: ${error.message}`);
    },
    async get(key) {
      const { data, error } = await bucket().download(key);
      if (error || !data) {
        if (/not.?found|404/i.test(error?.message ?? "")) return null;
        throw new Error(`[turfcut] profile photo download failed: ${error?.message ?? "no data"}`);
      }
      return new Uint8Array(await data.arrayBuffer());
    },
    async remove(key) {
      const { error } = await bucket().remove([key]);
      if (error) throw new Error(`[turfcut] profile photo removal failed: ${error.message}`);
    },
  };
}

/** What the photo feature needs from the database: one person's current key, and setting it. */
export interface PhotoRecords {
  keyOf(profileId: string): Promise<string | null>;
  setKey(profileId: string, key: string | null): Promise<void>;
}

/**
 * Replace a person's photo with `bytes`, judged from the bytes themselves (a
 * PNG or JPEG up to 2 MB, camera data stripped: checkImage). The new file is
 * stored first and the record pointed at it; only then is the old file
 * removed, so a failure never leaves the record pointing at nothing.
 */
export async function setProfilePhoto(profileId: string, bytes: Uint8Array, db: PhotoRecords, store: PhotoStore): Promise<{ ok: true; key: string } | { ok: false; reason: string }> {
  const img = checkImage(bytes);
  if (!img.ok) return img;
  const old = await db.keyOf(profileId);
  const key = `${profileId}/${randomUUID()}.${img.ext}`;
  await store.put(key, img.bytes, img.type);
  try {
    await db.setKey(profileId, key);
  } catch (e) {
    await store.remove(key).catch(() => {});
    throw e;
  }
  // The new photo is saved either way; an old file that would not go is logged, not shown as a failure.
  if (old && ownsKey(profileId, old)) await store.remove(old).catch((err) => console.error("[turfcut] an old profile photo was left behind", old, err));
  return { ok: true, key };
}

/**
 * Remove a person's photo: the file first, then the record, so a file that
 * could not be removed is still on record and can be tried again.
 */
export async function clearProfilePhoto(profileId: string, db: PhotoRecords, store: PhotoStore): Promise<void> {
  const old = await db.keyOf(profileId);
  if (!old) return;
  if (ownsKey(profileId, old)) await store.remove(old);
  await db.setKey(profileId, null);
}

/**
 * A person's own photo, for that person only. Null when they have none.
 * `have` is the tag the browser already holds: when it is still the current
 * one, nothing is fetched from storage.
 */
export async function ownPhoto(profileId: string, db: PhotoRecords, store: PhotoStore, have?: string | null): Promise<{ tag: string; unchanged: true } | { tag: string; unchanged: false; bytes: Uint8Array; type: "image/png" | "image/jpeg" } | null> {
  const key = await db.keyOf(profileId);
  if (!key || !ownsKey(profileId, key)) return null;
  const tag = photoTag(key);
  if (have === tag) return { tag, unchanged: true };
  const bytes = await store.get(key);
  return bytes ? { tag, unchanged: false, bytes, type: photoType(key) } : null;
}
