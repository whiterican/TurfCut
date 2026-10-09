import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { methodsFor } from "./credentials";
import { chainHeads, cleanPhoto, openPhoto, proofEligible, proofGone, proofKey, proofLapsed, proofLapsesOn, sealPhoto, sniffImage, type ChainRow } from "./proof-photos";

const photo = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 180, b: 160 } } });
const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe("proof photos", () => {
  it("knows a JPEG and a PNG by their bytes, nothing else", async () => {
    expect(sniffImage(await photo(4, 4).jpeg().toBuffer())).toBe("jpeg");
    expect(sniffImage(await photo(4, 4).png().toBuffer())).toBe("png");
    expect(sniffImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImage(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });

  it("re-encodes without the camera's metadata (location, device), upright and capped", async () => {
    const tagged = await photo(3000, 1000)
      .jpeg()
      .withExif({ IFD0: { Make: "PhoneCo", Model: "Secret Model", Copyright: "home address" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "39/1 44/1 0/1" } })
      .toBuffer();
    expect((await sharp(tagged).metadata()).exif).toBeDefined();
    const r = await cleanPhoto(tagged);
    if (!r.ok) throw new Error(r.reason);
    const meta = await sharp(r.photo.bytes).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(r.photo.bytes.includes(Buffer.from("Secret Model"))).toBe(false);
    expect(r.photo.bytes.includes(Buffer.from("PhoneCo"))).toBe(false);
    expect([r.photo.width, r.photo.height]).toEqual([2400, 800]);
    expect(r.photo.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("takes a PNG (transparency on white) and refuses anything that isn't a readable photo", async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const r = await cleanPhoto(png);
    expect(r.ok && (await sharp(r.photo.bytes).metadata()).format).toBe("jpeg");
    expect((await cleanPhoto(Buffer.from("GIF89a....")))).toEqual({ ok: false, reason: "Send a JPEG or PNG photo." });
    expect((await cleanPhoto(new Uint8Array()))).toEqual({ ok: false, reason: "Choose a photo." });
    const truncated = (await photo(50, 50).jpeg().toBuffer()).subarray(0, 40);
    expect((await cleanPhoto(truncated)).ok).toBe(false);
    expect((await cleanPhoto(new Uint8Array(4 * 1024 * 1024 + 1).fill(0xff))).ok).toBe(false);
  });

  it("refuses an image over the pixel cap before decoding it", async () => {
    // 8000 x 6000 = 48 megapixels, over the 40 MP cap (a small file: one colour).
    const big = await photo(8000, 6000).png({ compressionLevel: 9 }).toBuffer();
    const r = await cleanPhoto(big);
    expect(r.ok).toBe(false);
  });

  it("seals with AES-GCM bound to the photo's id: tampering or a moved file doesn't open", () => {
    const key = randomBytes(32);
    const plain = Buffer.from("certificate bytes");
    const sealed = sealPhoto(key, "id-1", plain);
    expect(sealed.includes(plain)).toBe(false);
    expect(openPhoto(key, "id-1", sealed).equals(plain)).toBe(true);
    expect(() => openPhoto(key, "id-2", sealed)).toThrow();
    expect(() => openPhoto(randomBytes(32), "id-1", sealed)).toThrow();
    const bent = Buffer.from(sealed);
    bent[bent.length - 1] ^= 1;
    expect(() => openPhoto(key, "id-1", bent)).toThrow();
    expect(sealPhoto(key, "id-1", plain).equals(sealed)).toBe(false); // a fresh IV each time
  });

  it("needs a real 32-byte key, never a default", () => {
    expect(() => proofKey(undefined)).toThrow(/not set/);
    expect(() => proofKey("  ")).toThrow(/not set/);
    expect(() => proofKey("short")).toThrow(/32 random bytes/);
    expect(() => proofKey(randomBytes(16).toString("base64"))).toThrow(/32 random bytes/);
    expect(proofKey(randomBytes(32).toString("base64")).length).toBe(32);
  });

  it("takes only a dated Colorado training credential, and lapses a year after the training", () => {
    expect(proofEligible({ kind: "TRAINING", state: "CO", issuedOn: day("2026-03-01") })).toBe(true);
    expect(proofEligible({ kind: "TRAINING", state: "AZ", issuedOn: day("2026-03-01") })).toBe(false);
    expect(proofEligible({ kind: "TRAINING", state: "CO", issuedOn: null })).toBe(false);
    expect(proofEligible({ kind: "CIRCULATOR_REGISTRATION", state: "CO", issuedOn: day("2026-03-01") })).toBe(false);
    expect(proofEligible({ kind: "NOTARY_OR_AFFIDAVIT", state: "CO", issuedOn: day("2026-03-01") })).toBe(false);
    expect(proofEligible({ kind: "OTHER", state: "CO", issuedOn: day("2026-03-01") })).toBe(false);
    expect(proofLapsesOn(day("2026-03-01"))).toBe("2027-03-01");
    expect(proofLapsesOn(day("2024-02-29"))).toBe("2025-03-01");
    expect(proofLapsed(day("2026-03-01"), "2027-02-28")).toBe(false);
    expect(proofLapsed(day("2026-03-01"), "2027-03-01")).toBe(true);
  });

  it("follows a credential's edits to its current row, and says why a photo must go", () => {
    const row = (id: string, supersedesId: string | null, over: Partial<ChainRow> = {}): ChainRow => ({ id, supersedesId, kind: "TRAINING", state: "CO", issuedOn: day("2026-03-01"), removed: false, ...over });
    const rows = [row("a", null), row("b", "a"), row("c", "b", { state: "AZ" }), row("x", null), row("y", "x", { removed: true, state: null, issuedOn: null })];
    const heads = chainHeads(rows);
    expect(["a", "b", "c"].map((id) => heads.get(id)!.id)).toEqual(["c", "c", "c"]);
    expect(heads.get("x")!.id).toBe("y");
    expect(proofGone(heads.get("a")!, false, "2026-06-01")).toBe("NO_LONGER_ELIGIBLE");
    expect(proofGone(heads.get("x")!, false, "2026-06-01")).toBe("CREDENTIAL_REMOVED");
    expect(proofGone(row("z", null), true, "2026-06-01")).toBe("ACCOUNT_CLOSED");
    expect(proofGone(row("z", null), false, "2027-03-01")).toBe("LAPSED");
    expect(proofGone(row("z", null), false, "2026-06-01")).toBeNull();
  });

  it("offers \"looked at the proof photo\" only once the organization opened one", () => {
    const training = { kind: "TRAINING" as const, state: "CO" };
    expect(methodsFor(training)).toEqual(["ORIGINAL_DOCUMENT"]);
    expect(methodsFor(training, { photoSeen: true })).toEqual(["ORIGINAL_DOCUMENT", "PROOF_PHOTO"]);
    expect(methodsFor({ kind: "CIRCULATOR_REGISTRATION", state: "CO" })).toEqual(["REGISTRY_LOOKUP", "ORIGINAL_DOCUMENT"]);
  });
});
