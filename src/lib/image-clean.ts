import { imageSize } from "@/lib/attachment-scan";

/**
 * Checking and cleaning an uploaded picture, judged from its bytes: a PNG or
 * JPEG of a sensible size, with everything that isn't the picture (location,
 * camera details, text) taken out. Shared by campaign images and profile
 * photos; nothing here knows what the picture is for.
 */
export const MEDIA_MAX_BYTES = 2 * 1024 * 1024;
const MIN_SIDE = 64;
const MAX_SIDE = 4096;

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
  for (;;) {
    if (i >= b.length || b[i] !== 0xff) return null;
    let m = i + 1;
    while (m < b.length && b[m] === 0xff) m++; // fill bytes
    const marker = b[m];
    if (marker === undefined) return null;
    const start = m - 1;
    if (marker === 0xd9) {
      // End of image: the picture ends here. Anything after it (a phone's second image with its own EXIF, appended data) goes.
      keep.push(b.subarray(start, m + 1));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      keep.push(b.subarray(start, m + 1));
      i = m + 1;
      continue;
    }
    if (m + 2 >= b.length) return null;
    const len = (b[m + 1] << 8) | b[m + 2];
    if (len < 2 || m + 1 + len > b.length) return null;
    let end = m + 1 + len;
    // APP1 (EXIF/XMP), APP3–APP13 (maker data, IPTC) and COM (comments) go; APP0, APP2 (colour profile), APP14 and the rest stay.
    const drop = marker === 0xe1 || (marker >= 0xe3 && marker <= 0xed) || marker === 0xfe;
    if (marker === 0xda) {
      // Start of scan: the compressed data runs until the next real marker (FF00 is a stuffed byte, FFD0–FFD7 are restarts).
      let j = end;
      while (j < b.length) {
        if (b[j] === 0xff && j + 1 < b.length && b[j + 1] !== 0x00 && !(b[j + 1] >= 0xd0 && b[j + 1] <= 0xd7) && b[j + 1] !== 0xff) break;
        j++;
      }
      end = j;
    }
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

/** The PNG chunks that draw the picture or its colours; everything else (text, EXIF, times, private chunks) goes. */
const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "pHYs", "bKGD", "sBIT"]);
export function stripPngMetadata(b: Uint8Array): Uint8Array | null {
  const keep: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  let ended = false;
  while (i + 12 <= b.length) {
    const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const end = i + 12 + len;
    if (end > b.length) return null;
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    if (PNG_KEEP.has(type)) keep.push(b.subarray(i, end));
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
