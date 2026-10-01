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
    if (t.length >= 40 && /^[A-Za-z0-9+/=_-]+$/.test(t)) {
      run += t.length;
      if (run >= 1000) return PICTURES_REASON;
    } else if (t) run = 0;
  }
  return null;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/** Picture-carrying PDF features: image XObjects, inline images, image filters, attached files. */
const PDF_PICTURES = /\/Subtype\s*\/Image\b|\/(DCTDecode|JPXDecode|JBIG2Decode|CCITTFaxDecode|EmbeddedFiles?|FileAttachment|RichMedia|Movie|Sound)\b|(^|\s)BI\s*\/(W|Width|IM|ImageMask)\b/;
/** Encodings we can't see through. */
const PDF_OPAQUE = /\/(Encrypt|LZWDecode|ASCII85Decode|ASCIIHexDecode|RunLengthDecode|Crypt)\b/;

/** PDF text with name escapes (#49) undone and comments stripped, so neither can hide a keyword. */
const pdfNormalize = (s: string) => s.replace(/#([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/%[^\r\n]*/g, " ");

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
    re.lastIndex = end;
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
    const n = pdfNormalize(t);
    if (PDF_PICTURES.test(n)) return PICTURES_REASON;
    if (PDF_OPAQUE.test(n)) return UNCHECKABLE;
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
const PRINTER_SETTINGS = /^xl\/printerSettings\/printerSettings\d+\.bin$/;
/** Relationships that pull in pictures, files or remote content. */
const PICTURE_RELS = /relationships\/(image|oleObject|package|aFChunk|video|audio|media|hdphoto|attachedTemplate|frame)"|TargetMode\s*=\s*"External"/i;

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
    if (!/\.(xml|rels)$/.test(n) && !PRINTER_SETTINGS.test(n)) return PICTURES_REASON;
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
    if (looksLikeImage(data)) return PICTURES_REASON;
    if (PRINTER_SETTINGS.test(e.name)) {
      if (data.length > 64 * 1024) return PICTURES_REASON;
    } else {
      const text = decoder.decode(data);
      if (PICTURE_RELS.test(text) || textProblem(text)) return PICTURES_REASON;
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
