import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import sharp from "sharp";
import type { CredentialKind } from "@/lib/credentials";

/**
 * Proof photos (C3.6b): what Turfcut accepts, how it cleans a photo, and
 * how it seals it. Phase 1 takes one document, Colorado's Secretary of
 * State circulator training certificate, on a training credential the
 * worker dated. A photo is evidence a person checks, never verification by
 * itself (README "Credential proof photos").
 */

/** What the worker may send: JPEG or PNG, up to 4 MB and 40 megapixels. */
export const PROOF_MAX_BYTES = 4 * 1024 * 1024;
export const PROOF_MAX_INPUT_PIXELS = 40_000_000;
/** What is kept: a JPEG no larger than this on its longest side. */
export const PROOF_MAX_EDGE = 2400;
/** A front and a back, at most, per credential. */
export { PROOF_SIDES, SIDE_LABELS, type ProofSide } from "@/lib/proof-sides";

/** A Colorado training credential with a training date: the only kind that takes a photo. */
export function proofEligible(c: { kind: CredentialKind; state: string | null; issuedOn: Date | null; removed?: boolean }): boolean {
  return c.kind === "TRAINING" && c.state === "CO" && !!c.issuedOn && !c.removed;
}

/**
 * The day a photo lapses: a year after the training date, when the
 * Colorado registration it supports ends (YYYY-MM-DD, UTC dates).
 */
export function proofLapsesOn(issuedOn: Date): string {
  const d = new Date(issuedOn);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
/** `today` as YYYY-MM-DD (expiryToday). On its lapse day a photo is gone. */
export const proofLapsed = (issuedOn: Date, today: string) => today >= proofLapsesOn(issuedOn);

/** The format the bytes are, by their signature (never the name or the browser's word for it). */
export function sniffImage(bytes: Uint8Array): "jpeg" | "png" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "png";
  return null;
}

export type CleanPhoto = { bytes: Buffer; sha256: string; width: number; height: number };

/**
 * Re-encodes a photo as a fresh JPEG: turned upright, at most
 * PROOF_MAX_EDGE on its longest side, on white, with nothing carried over
 * (sharp keeps no metadata unless asked, so location and camera details
 * are gone). Refuses anything that isn't a readable JPEG or PNG within the
 * caps.
 */
export async function cleanPhoto(input: Uint8Array): Promise<{ ok: true; photo: CleanPhoto } | { ok: false; reason: string }> {
  if (!input.length) return { ok: false, reason: "Choose a photo." };
  if (input.length > PROOF_MAX_BYTES) return { ok: false, reason: "That photo is over 4 MB. Take it again at a lower resolution." };
  const kind = sniffImage(input);
  if (!kind) return { ok: false, reason: "Send a JPEG or PNG photo." };
  try {
    const img = sharp(input, { limitInputPixels: PROOF_MAX_INPUT_PIXELS, failOn: "error", animated: false });
    const meta = await img.metadata();
    if (meta.format !== kind) return { ok: false, reason: "Send a JPEG or PNG photo." };
    const { data, info } = await img
      .rotate()
      .resize({ width: PROOF_MAX_EDGE, height: PROOF_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > PROOF_MAX_BYTES) return { ok: false, reason: "That photo is too detailed to keep. Take it again at a lower resolution." };
    return { ok: true, photo: { bytes: data, sha256: createHash("sha256").update(data).digest("hex"), width: info.width, height: info.height } };
  } catch {
    // Unreadable, truncated or over the pixel limit.
    return { ok: false, reason: "Turfcut couldn't read that photo. Send a JPEG or PNG under 40 megapixels." };
  }
}

/**
 * The encryption key (CREDENTIAL_PROOF_KEY): 32 random bytes in base64,
 * kept apart from every other secret. Throws when unset or malformed:
 * never a default.
 */
export function proofKey(v = process.env.CREDENTIAL_PROOF_KEY): Buffer {
  const t = v?.trim();
  if (!t) throw new Error("[turfcut] CREDENTIAL_PROOF_KEY is not set: proof photos can't be stored or read.");
  const key = /^[A-Za-z0-9+/]+={0,2}$/.test(t) ? Buffer.from(t, "base64") : Buffer.alloc(0);
  if (key.length !== 32) throw new Error("[turfcut] CREDENTIAL_PROOF_KEY must be 32 random bytes in base64 (openssl rand -base64 32).");
  return key;
}

const MAGIC = Buffer.from("TCP1");

/**
 * AES-256-GCM. The sealed file is MAGIC, a fresh 12-byte IV, the 16-byte
 * tag and the ciphertext; the proof id is bound in as associated data, so
 * a file moved to another photo's place doesn't open.
 */
export function sealPhoto(key: Buffer, proofId: string, plain: Uint8Array): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(proofId));
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

export function openPhoto(key: Buffer, proofId: string, sealed: Uint8Array): Buffer {
  const b = Buffer.from(sealed);
  if (b.length < 32 || !b.subarray(0, 4).equals(MAGIC)) throw new Error("[turfcut] not a sealed proof photo");
  const d = createDecipheriv("aes-256-gcm", key, b.subarray(4, 16));
  d.setAAD(Buffer.from(proofId));
  d.setAuthTag(b.subarray(16, 32));
  return Buffer.concat([d.update(b.subarray(32)), d.final()]);
}

export type ChainRow = { id: string; supersedesId: string | null; kind: CredentialKind; state: string | null; issuedOn: Date | null; removed: boolean };

/**
 * Each credential row's current row: the end of its edit chain (a removal
 * row when the credential was taken down). A photo stays with its
 * credential through the worker's edits and follows the chain's end.
 */
export function chainHeads<T extends ChainRow>(rows: T[]): Map<string, T> {
  const next = new Map<string, T>();
  for (const r of rows) if (r.supersedesId) next.set(r.supersedesId, r);
  const heads = new Map<string, T>();
  for (const r of rows) {
    let h = r;
    for (let n = next.get(h.id); n; n = next.get(h.id)) h = n;
    heads.set(r.id, h);
  }
  return heads;
}

export type ProofGone = "ACCOUNT_CLOSED" | "CREDENTIAL_REMOVED" | "NO_LONGER_ELIGIBLE" | "LAPSED";

/** Why a photo must go now, or null while it may stay. */
export function proofGone(head: ChainRow, workerClosed: boolean, today: string): ProofGone | null {
  if (workerClosed) return "ACCOUNT_CLOSED";
  if (head.removed) return "CREDENTIAL_REMOVED";
  if (!proofEligible(head)) return "NO_LONGER_ELIGIBLE";
  if (proofLapsed(head.issuedOn!, today)) return "LAPSED";
  return null;
}
