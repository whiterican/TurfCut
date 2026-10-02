import { inflateRawSync, inflateSync, constants } from "node:zlib";
import { PETITION_NOTICE, checkAttachment } from "@/lib/chat";

/**
 * Server-side content scan for chat attachments (runs after the type and
 * name checks in lib/chat.ts). Turfcut chats share text-only documents:
 * anything that carries a picture — scanned PDFs, Office files with images
 * or embedded files, images encoded into text — is refused, because signed
 * petition sheets must never be photographed or shared.
 *
 * This stops accidental and casual sharing. Someone determined to smuggle
 * an image can always find an encoding no scanner knows; the custody policy,
 * the composer notice and message reports are the backstop.
 */

export const PICTURES_REASON = `This file has pictures or embedded files in it, and Turfcut chats share text-only documents. ${PETITION_NOTICE}`;
const NOT_OFFICE = "That file isn't a real Word or Excel document.";
const UNCHECKABLE = "Turfcut can't check this file's contents. Share a plain PDF, Word or Excel document, or a text file.";
/** Total bytes we'll decompress while scanning one file (zip-bomb guard). */
const INFLATE_BUDGET = 50 * 1024 * 1024;

const latin1 = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

const IMAGE_MAGIC: number[][] = [
  [0xff, 0xd8, 0xff], // jpeg
  [0x89, 0x50, 0x4e, 0x47], // png
  [0x47, 0x49, 0x46, 0x38], // gif
  [0x42, 0x4d], // bmp
  [0x49, 0x49, 0x2a, 0x00], // tiff
  [0x4d, 0x4d, 0x00, 0x2a],
  [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50], // jpeg 2000
];
const looksLikeImage = (b: Uint8Array) =>
  IMAGE_MAGIC.some((sig) => sig.every((v, i) => b[i] === v)) ||
  (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) || // webp
  (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70); // heic/avif/mp4

/** Pixel size from a PNG or JPEG header; null if unreadable (or another format). */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const be16 = (o: number) => (b[o] << 8) | b[o + 1];
  const be32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { width: be32(16), height: be32(20) };
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  // Walk JPEG segments to the first start-of-frame marker.
  for (let o = 2; o + 9 < b.length; ) {
    if (b[o] !== 0xff) return null;
    const marker = b[o + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: be16(o + 5), width: be16(o + 7) };
    o += 2 + be16(o + 2);
  }
  return null;
}

/**
 * A preview carries nothing but its one small picture: a JPEG with a single
 * image (no second SOI, no large APP/EXIF blocks, nothing after EOI), or a
 * PNG with only core chunks and nothing after IEND.
 */
function plainPreview(b: Uint8Array): boolean {
  if (b[0] === 0x89) {
    const be32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
    const CORE = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "sRGB", "gAMA", "pHYs", "cHRM", "iCCP", "sBIT", "bKGD"]);
    for (let o = 8; o + 12 <= b.length; ) {
      const len = be32(o);
      const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
      if (!CORE.has(type)) return false;
      o += 12 + len;
      if (type === "IEND") return o === b.length;
    }
    return false;
  }
  let sois = 0;
  for (let i = 0; i + 2 < b.length; i++) if (b[i] === 0xff && b[i + 1] === 0xd8 && b[i + 2] === 0xff) sois++;
  if (sois !== 1) return false;
  let end = b.length;
  while (end > 0 && b[end - 1] === 0) end--; // tolerate zero padding
  if (end < 2 || b[end - 2] !== 0xff || b[end - 1] !== 0xd9) return false;
  for (let o = 2; o + 4 <= b.length; ) {
    if (b[o] !== 0xff) return false;
    const marker = b[o + 1];
    if (marker === 0xda) return true; // start of scan: headers done
    const len = (b[o + 2] << 8) | b[o + 3];
    if (marker >= 0xe0 && marker <= 0xef && len > 4096) return false;
    o += 2 + len;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Images written out as text: SVG, data URIs, netpbm/XPM, uuencode, or base64/hex blocks (wrapped or not). */
export function textProblem(text: string): string | null {
  if (/<([\w-]+:)?svg[\s>/]|data:\s*image\/|\/\* XPM \*\/|^begin(-base64)? [0-7]{3} /im.test(text)) return PICTURES_REASON;
  if (/^\s*P[1-7]\s+(#[^\n]*\n\s*)*\d+\s+\d+/.test(text)) return PICTURES_REASON; // netpbm header
  if (/[A-Za-z0-9+/=_-]{1000,}/.test(text)) return PICTURES_REASON;
  // Wrapped encodings: consecutive lines that are nothing but base64/hex.
  let run = 0;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    // Short hex lines (checksums, IDs: up to 64 characters) are ordinary data.
    const checksum = t.length <= 64 && /^[0-9a-fA-F]+$/.test(t);
    if (t.length >= 40 && !checksum && /^[A-Za-z0-9+/=_-]+$/.test(t)) {
      run += t.length;
      if (run >= 1000) return PICTURES_REASON;
    } else if (t) run = 0;
  }
  return null;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/**
 * Picture-carrying PDF features: image XObjects, inline images (the BI
 * operator, whatever key comes first), image filters, attached files.
 */
const PDF_PICTURES = /\/Subtype\s*\/Image\b|\/(DCTDecode|JPXDecode|JBIG2Decode|CCITTFaxDecode|EmbeddedFiles?|FileAttachment|RichMedia|Movie|Sound)\b|(^|[\s()<>[\]{}])BI\s*\/[A-Za-z]/;
/** Encodings we can't see through. */
const PDF_OPAQUE = /\/(Encrypt|LZWDecode|ASCII85Decode|ASCIIHexDecode|RunLengthDecode|Crypt)\b/;

/** PDF text with name escapes (#49) undone, so they can't hide a keyword. */
const pdfUnescape = (s: string) => s.replace(/#([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
/**
 * Both readings of the text: comments stripped (so a comment can't split a
 * keyword) and not (a "%" inside a string like "(50% off)" isn't a comment,
 * and stripping to the end of the line would hide what follows it).
 */
const pdfReadings = (s: string) => {
  const u = pdfUnescape(s);
  return [u.replace(/%[^\r\n]*/g, " "), u];
};

export function pdfProblem(bytes: Uint8Array): string | null {
  const raw = latin1(bytes);
  if (!raw.startsWith("%PDF-")) return UNCHECKABLE;
  const texts = [raw];
  // Page content and object streams are usually Flate-compressed: inline
  // images and object dictionaries hide inside them, so decompress each.
  let budget = INFLATE_BUDGET;
  const re = /stream\r?\n/g;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    re.lastIndex = end + "endstream".length; // don't re-match the "stream" inside "endstream"
    try {
      const out = inflateSync(bytes.subarray(start, end), { finishFlush: constants.Z_SYNC_FLUSH, maxOutputLength: budget });
      budget -= out.length;
      texts.push(latin1(out));
    } catch (e) {
      if (e instanceof RangeError) return UNCHECKABLE; // over budget
      // Not Flate (e.g. a font program) — the dictionary check covers its filter.
    }
  }
  for (const t of texts) {
    const readings = pdfReadings(t);
    if (readings.some((n) => PDF_PICTURES.test(n))) return PICTURES_REASON;
    if (readings.some((n) => PDF_OPAQUE.test(n))) return UNCHECKABLE;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Word / Excel (OOXML zip)
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  compSize: number;
  localOffset: number;
}

/** The central directory, or null if this isn't a plain, readable zip. */
export function zipDirectory(b: Uint8Array): { entries: ZipEntry[]; cdStart: number } | null {
  const u16 = (o: number) => b[o] | (b[o + 1] << 8);
  const u32 = (o: number) => (u16(o) | (u16(o + 2) << 16)) >>> 0;
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = u16(eocd + 10);
  const cdStart = u32(eocd + 16);
  if (count === 0xffff || cdStart === 0xffffffff || cdStart > eocd) return null; // zip64 / malformed
  const entries: ZipEntry[] = [];
  let at = cdStart;
  for (let n = 0; n < count; n++) {
    if (at + 46 > eocd || u32(at) !== 0x02014b50) return null;
    const [nameLen, extraLen, commentLen] = [u16(at + 28), u16(at + 30), u16(at + 32)];
    if (at + 46 + nameLen > eocd) return null;
    entries.push({
      name: new TextDecoder().decode(b.subarray(at + 46, at + 46 + nameLen)),
      flags: u16(at + 8),
      method: u16(at + 10),
      compSize: u32(at + 20),
      localOffset: u32(at + 42),
    });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, cdStart };
}

const OOXML_PART = /^(\[Content_Types\]\.xml|_rels\/|docProps\/|customXml\/|word\/|xl\/)/;
const PRINTER_SETTINGS = /^(xl|word)\/printerSettings\/printerSettings\d+\.bin$/;
/**
 * The page preview Word/Excel save (Mac default). Allowed only when tiny —
 * at most 256 px a side and 32 KB — far too small to read a signature.
 */
const THUMBNAIL = /^docProps\/thumbnail\.(jpe?g|png|emf|wmf)$/;
/** Relationship types that pull in pictures, files or other documents. */
const PICTURE_REL_TYPE = /\/(image|oleObject|package|aFChunk|video|audio|media|hdphoto|attachedTemplate|frame|subDocument)$/i;

/** Pictures pulled in by a .rels part — embedded, or linked from the web. Plain hyperlinks are fine. */
function relsProblem(xml: string): boolean {
  for (const rel of xml.match(/<(\w+:)?Relationship\b[^>]*>/g) ?? []) {
    const type = /\bType\s*=\s*["']([^"']*)["']/.exec(rel)?.[1] ?? "";
    const external = /\bTargetMode\s*=\s*["']External["']/i.test(rel);
    if (PICTURE_REL_TYPE.test(type)) return true;
    if (external && !/\/hyperlink$/i.test(type)) return true;
  }
  return false;
}

export function ooxmlProblem(type: string, bytes: Uint8Array): string | null {
  const zip = zipDirectory(bytes);
  if (!zip) return NOT_OFFICE;
  const { entries, cdStart } = zip;
  const main = type.includes("wordprocessing") ? "word/" : "xl/";
  const names = entries.map((e) => e.name);
  if (!names.includes("[Content_Types].xml") || !names.some((n) => n.startsWith(main))) return NOT_OFFICE;
  if (new Set(names).size !== names.length) return NOT_OFFICE;
  for (const n of names) {
    if (!OOXML_PART.test(n)) return NOT_OFFICE;
    if (!/\.(xml|rels)$/.test(n) && !PRINTER_SETTINGS.test(n) && !THUMBNAIL.test(n)) return PICTURES_REASON;
  }

  // The local entries must tile the file from byte 0 to the central
  // directory: no hidden data before, between or after them.
  const u16 = (o: number) => bytes[o] | (bytes[o + 1] << 8);
  const sorted = [...entries].sort((a, b) => a.localOffset - b.localOffset);
  let expected = 0;
  let budget = INFLATE_BUDGET;
  const decoder = new TextDecoder();
  for (const e of sorted) {
    const gap = e.localOffset - expected;
    if (!(gap === 0 || (expected > 0 && [12, 16, 20, 24].includes(gap)))) return NOT_OFFICE;
    const o = e.localOffset;
    if (o + 30 > cdStart || bytes[o] !== 0x50 || bytes[o + 1] !== 0x4b || bytes[o + 2] !== 0x03 || bytes[o + 3] !== 0x04) return NOT_OFFICE;
    const nameLen = u16(o + 26);
    const extraLen = u16(o + 28);
    if (decoder.decode(bytes.subarray(o + 30, o + 30 + nameLen)) !== e.name) return NOT_OFFICE;
    if (e.flags & 0x1) return UNCHECKABLE; // encrypted entry
    const dataStart = o + 30 + nameLen + extraLen;
    const dataEnd = dataStart + e.compSize;
    if (dataEnd > cdStart) return NOT_OFFICE;
    let data: Uint8Array;
    try {
      if (e.method === 0) data = bytes.subarray(dataStart, dataEnd);
      else if (e.method === 8) data = inflateRawSync(bytes.subarray(dataStart, dataEnd), { maxOutputLength: budget });
      else return UNCHECKABLE;
    } catch {
      return UNCHECKABLE;
    }
    budget -= data.length;
    if (THUMBNAIL.test(e.name)) {
      const size = imageSize(data);
      if (data.length > 32 * 1024 || !size || size.width > 256 || size.height > 256 || !plainPreview(data)) return PICTURES_REASON;
    } else if (looksLikeImage(data)) {
      return PICTURES_REASON;
    } else if (PRINTER_SETTINGS.test(e.name)) {
      if (data.length > 64 * 1024) return PICTURES_REASON;
    } else {
      const text = decoder.decode(data);
      if ((e.name.endsWith(".rels") && relsProblem(text)) || textProblem(text)) return PICTURES_REASON;
    }
    expected = dataEnd;
  }
  const tail = cdStart - expected;
  if (!(tail === 0 || (sorted.length > 0 && [12, 16, 20, 24].includes(tail)))) return NOT_OFFICE;
  return null;
}

// ---------------------------------------------------------------------------

/** Why this file's contents are refused, or null. `type` comes from sniffType. */
export function scanContents(type: string, bytes: Uint8Array): string | null {
  if (type === "application/pdf") return pdfProblem(bytes);
  if (type.startsWith("application/vnd.openxmlformats")) return ooxmlProblem(type, bytes);
  if (type === "text/plain" || type === "text/csv") return textProblem(new TextDecoder().decode(bytes));
  return UNCHECKABLE;
}

/** The full attachment policy: type and name (lib/chat.ts), then contents. */
export function vetAttachment(file: { name: string; size: number; bytes: Uint8Array }): { ok: true; type: string } | { ok: false; reason: string } {
  const first = checkAttachment(file);
  if (!first.ok) return first;
  const problem = scanContents(first.type, file.bytes);
  return problem ? { ok: false, reason: problem } : first;
}
