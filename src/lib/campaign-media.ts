import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/env";
import { imageSize } from "@/lib/attachment-scan";

/**
 * Campaign avatars and header images (S1) live in a PUBLIC Supabase Storage
 * bucket: they're shown on a public page. Only the server writes to it
 * (service role), after the campaign staff check. Every file is public by
 * its (unguessable) address from the moment it's uploaded, draft or not.
 * Setup (README, S1): create the bucket "campaign-media" as public, with a
 * 2 MB file size limit and allowed types image/png and image/jpeg.
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

/**
 * What an uploaded image is, judged from its bytes (never its name or the
 * browser's word): a PNG or JPEG of a sensible size, or why not.
 */
export function checkImage(bytes: Uint8Array): { ok: true; type: "image/png" | "image/jpeg"; ext: "png" | "jpg"; bytes: Uint8Array } | { ok: false; reason: string } {
  if (bytes.length === 0) return { ok: false, reason: "Choose an image." };
  if (bytes.length > MEDIA_MAX_BYTES) return { ok: false, reason: "Images are up to 2 MB." };
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!png && !jpeg) return { ok: false, reason: "Use a PNG or JPEG image." };
  const size = imageSize(bytes);
  if (!size) return { ok: false, reason: "That image couldn't be read. Try saving it again as a PNG or JPEG." };
  if (size.width < MIN_SIDE || size.height < MIN_SIDE) return { ok: false, reason: `Images need to be at least ${MIN_SIDE} pixels on each side.` };
  if (size.width > MAX_SIDE || size.height > MAX_SIDE) return { ok: false, reason: `Images are up to ${MAX_SIDE} pixels on each side.` };
  const clean = png ? stripPngMetadata(bytes) : stripJpegMetadata(bytes);
  if (!clean) return { ok: false, reason: "That image couldn't be read. Try saving it again as a PNG or JPEG." };
  return png ? { ok: true, type: "image/png", ext: "png", bytes: clean } : { ok: true, type: "image/jpeg", ext: "jpg", bytes: clean };
}

/**
 * The image without what a camera writes about it: a JPEG keeps its
 * picture, colour profile and format markers and loses EXIF (with GPS),
 * XMP, maker notes, comments and the like; a PNG loses its text and EXIF
 * chunks. (A photo whose EXIF said "rotate" may then show sideways: export
 * it upright.) Null when the file isn't laid out as its format says.
 */
export function stripJpegMetadata(b: Uint8Array): Uint8Array | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  const keep: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    let m = i + 1;
    while (m < b.length && b[m] === 0xff) m++; // fill bytes
    const marker = b[m];
    if (marker === undefined) return null;
    const start = m - 1;
    // Markers with no length: TEM, RSTn, SOI, EOI.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      keep.push(b.subarray(start, m + 1));
      i = m + 1;
      if (marker === 0xd9) break;
      continue;
    }
    if (m + 2 >= b.length) return null;
    const len = (b[m + 1] << 8) | b[m + 2];
    if (len < 2 || m + 1 + len > b.length) return null;
    const end = m + 1 + len;
    if (marker === 0xda) {
      // Start of scan: the compressed picture and everything after it, as is.
      keep.push(b.subarray(start));
      i = b.length;
      break;
    }
    // APP1 (EXIF/XMP), APP3–APP13 (maker data, IPTC) and COM (comments) go; APP0, APP2 (colour profile), APP14 and the rest stay.
    const drop = marker === 0xe1 || (marker >= 0xe3 && marker <= 0xed) || marker === 0xfe;
    if (!drop) keep.push(b.subarray(start, end));
    i = end;
  }
  const out = new Uint8Array(keep.reduce((n, k) => n + k.length, 0));
  let o = 0;
  for (const k of keep) {
    out.set(k, o);
    o += k.length;
  }
  return out;
}

const PNG_DROP = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);
export function stripPngMetadata(b: Uint8Array): Uint8Array | null {
  const keep: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  let ended = false;
  while (i + 12 <= b.length) {
    const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const end = i + 12 + len;
    if (end > b.length) return null;
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    if (!PNG_DROP.has(type)) keep.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") {
      ended = true;
      break;
    }
  }
  if (!ended) return null;
  const out = new Uint8Array(keep.reduce((n, k) => n + k.length, 0));
  let o = 0;
  for (const k of keep) {
    out.set(k, o);
    o += k.length;
  }
  return out;
}
