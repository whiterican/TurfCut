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
  /**
   * Remove every file under a person's id except `keep`. With `olderThanMs`,
   * only files at least that old go: a file another upload has just stored,
   * and not yet put on record, is left alone.
   */
  sweep(profileId: string, opts?: { keep?: string | null; olderThanMs?: number }): Promise<void>;
}

/** How long a stored file may sit off the record before an upload's sweep removes it (an upload in flight takes seconds). */
export const SWEEP_GRACE_MS = 10 * 60_000;

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
        const e = error as { status?: number; statusCode?: string; message?: string } | null;
        if (e?.status === 404 || e?.statusCode === "404" || /not.?found/i.test(e?.message ?? "")) return null;
        throw new Error(`[turfcut] profile photo download failed: ${e?.message ?? "no data"}`);
      }
      return new Uint8Array(await data.arrayBuffer());
    },
    async remove(key) {
      const { error } = await bucket().remove([key]);
      if (error) throw new Error(`[turfcut] profile photo removal failed: ${error.message}`);
    },
    async sweep(profileId, opts = {}) {
      const { data, error } = await bucket().list(profileId, { limit: 1000 });
      if (error) throw new Error(`[turfcut] profile photo listing failed: ${error.message}`);
      const before = opts.olderThanMs ? Date.now() - opts.olderThanMs : Infinity;
      const stale = (data ?? [])
        .filter((f) => `${profileId}/${f.name}` !== opts.keep && (before === Infinity || (f.created_at ? Date.parse(f.created_at) <= before : false)))
        .map((f) => `${profileId}/${f.name}`);
      if (!stale.length) return;
      const r = await bucket().remove(stale);
      if (r.error) throw new Error(`[turfcut] profile photo removal failed: ${r.error.message}`);
    },
  };
}

/** What the photo feature needs from the database: one person's current key, and changing it. */
export interface PhotoRecords {
  keyOf(profileId: string): Promise<string | null>;
  /** Point the record from `from` to `to`, only if it still holds `from`. False when it changed meanwhile. */
  swapKey(profileId: string, from: string | null, to: string | null): Promise<boolean>;
}

const left = (what: string) => (e: unknown) => console.error(`[turfcut] ${what}`, e);

/**
 * Replace a person's photo with `bytes`, judged from the bytes themselves (a
 * PNG or JPEG up to 2 MB, camera data stripped: checkImage). The new file is
 * stored first, then the record is pointed at it, only if nothing else
 * changed it meanwhile (two uploads at once: one wins, the other's file is
 * removed). Only then do the old file and any strays go, so a failure never
 * leaves the record pointing at nothing.
 */
export async function setProfilePhoto(profileId: string, bytes: Uint8Array, db: PhotoRecords, store: PhotoStore): Promise<{ ok: true; key: string } | { ok: false; reason: string }> {
  const img = checkImage(bytes);
  if (!img.ok) return img;
  const old = await db.keyOf(profileId);
  const key = `${profileId}/${randomUUID()}.${img.ext}`;
  await store.put(key, img.bytes, img.type);
  let swapped = false;
  try {
    swapped = await db.swapKey(profileId, old, key);
  } finally {
    if (!swapped) await store.remove(key).catch(left("a profile photo that was not saved was left behind"));
  }
  if (!swapped) return { ok: false, reason: "Your photo changed while this one was saving. Try again." };
  // The new photo is saved either way; a file that would not go is logged, and the next sweep takes it.
  if (old && ownsKey(profileId, old)) await store.remove(old).catch(left("an old profile photo was left behind"));
  await store.sweep(profileId, { keep: key, olderThanMs: SWEEP_GRACE_MS }).catch(left("sweeping old profile photos failed"));
  return { ok: true, key };
}

/**
 * Remove a person's photo at their request: the record is cleared first (so
 * an upload finishing at the same moment is never left pointing at nothing),
 * then the file and any old strays go.
 */
export async function clearProfilePhoto(profileId: string, db: PhotoRecords, store: PhotoStore): Promise<void> {
  const old = await db.keyOf(profileId);
  if (!old) {
    // Nothing on record. A file an earlier try could not remove may still be there: this throws if it still will not go.
    await store.sweep(profileId, { olderThanMs: SWEEP_GRACE_MS });
    return;
  }
  if (!(await db.swapKey(profileId, old, null))) return; // replaced meanwhile: that newer photo stays
  if (ownsKey(profileId, old)) await store.remove(old);
  await store.sweep(profileId, { olderThanMs: SWEEP_GRACE_MS }).catch(left("sweeping old profile photos failed"));
}

/**
 * Remove everything stored for a person, on record or not (closing an
 * account). The files go first and the record after, so a failure leaves the
 * record for the daily retry.
 */
export async function purgeProfilePhotos(profileId: string, db: PhotoRecords, store: PhotoStore): Promise<void> {
  await store.sweep(profileId);
  const old = await db.keyOf(profileId);
  if (old) await db.swapKey(profileId, old, null);
  // Once more: an upload still in flight as the account closed may have stored a file after the first pass.
  await store.sweep(profileId);
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
