import { describe, expect, it } from "vitest";
import { deflateRawSync, deflateSync } from "node:zlib";
import { vetAttachment } from "@/lib/attachment-scan";

const enc = (s: string) => new TextEncoder().encode(s);
const vet = (name: string, bytes: Uint8Array) => vetAttachment({ name, size: bytes.length, bytes });
const PICTURES = /pictures or embedded files[\s\S]*Do not photograph/;

/** A real zip (deflated entries, local headers, central directory). */
function zip(files: Record<string, Uint8Array | string>, opts: { prefix?: Uint8Array } = {}): Uint8Array {
  const le = (v: number, n: number) => Array.from({ length: n }, (_, i) => (v >>> (8 * i)) & 0xff);
  const out: number[] = [...(opts.prefix ?? [])];
  const central: number[] = [];
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === "string" ? enc(content) : content;
    const comp = [...deflateRawSync(data)];
    const nb = [...enc(name)];
    const offset = out.length;
    out.push(...le(0x04034b50, 4), 20, 0, 0, 0, 8, 0, 0, 0, 0, 0, ...le(0, 4), ...le(comp.length, 4), ...le(data.length, 4), ...le(nb.length, 2), 0, 0, ...nb, ...comp);
    central.push(
      ...le(0x02014b50, 4), 20, 0, 20, 0, 0, 0, 8, 0, 0, 0, 0, 0, ...le(0, 4), ...le(comp.length, 4), ...le(data.length, 4),
      ...le(nb.length, 2), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...le(offset, 4), ...nb
    );
  }
  const cdStart = out.length;
  const n = Object.keys(files).length;
  out.push(...central, ...le(0x06054b50, 4), 0, 0, 0, 0, ...le(n, 2), ...le(n, 2), ...le(central.length, 4), ...le(cdStart, 4), 0, 0);
  return new Uint8Array(out);
}

const DOCX = {
  "[Content_Types].xml": "<Types/>",
  "_rels/.rels": '<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  "word/document.xml": "<w:document><w:body><w:p><w:r><w:t>Meet at the library, 9am.</w:t></w:r></w:p></w:body></w:document>",
  "word/_rels/document.xml.rels": "<Relationships/>",
  "docProps/core.xml": "<cp:coreProperties/>",
};
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
/** A minimal JPEG (APP0, SOF0, SOS, a few data bytes, EOI) declaring the given size. */
const jpegOf = (w: number, h: number, trailer: number[] = []) =>
  new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0x12, 0x34, 0xff, 0xd9, ...trailer,
  ]);

describe("Word and Excel files", () => {
  it("accepts plain documents", () => {
    expect(vet("plan.docx", zip(DOCX)).ok).toBe(true);
    expect(vet("roster.xlsx", zip({ "[Content_Types].xml": "<Types/>", "xl/workbook.xml": "<workbook/>", "xl/worksheets/sheet1.xml": "<worksheet/>" })).ok).toBe(true);
  });
  it("accepts what real Word/Excel files carry: hyperlinks, page previews, printer settings, checksums", () => {
    const rels = '<Relationships><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://turfcut.app" TargetMode="External"/></Relationships>';
    expect(vet("plan.docx", zip({ ...DOCX, "word/_rels/document.xml.rels": rels })).ok).toBe(true);
    expect(vet("plan.docx", zip({ ...DOCX, "docProps/thumbnail.jpeg": jpegOf(256, 181) })).ok).toBe(true);
    expect(vet("roster.xlsx", zip({ "[Content_Types].xml": "<Types/>", "xl/workbook.xml": "<workbook/>", "xl/printerSettings/printerSettings1.bin": new Uint8Array(200) })).ok).toBe(true);
    const sha = Array.from({ length: 16 }, (_, i) => (i.toString(16).repeat(64))).join("\n");
    expect(vet("hashes.txt", enc(sha)).ok).toBe(true);
  });
  it("refuses a photo passed off as the page preview", () => {
    expect(vet("x.docx", zip({ ...DOCX, "docProps/thumbnail.jpeg": jpegOf(1700, 2200) })).ok).toBe(false);
    expect(vet("x.docx", zip({ ...DOCX, "docProps/thumbnail.jpeg": JPEG })).ok).toBe(false); // size unreadable
    // A small preview with a second, full-size picture appended after it.
    expect(vet("x.docx", zip({ ...DOCX, "docProps/thumbnail.jpeg": jpegOf(256, 181, [...jpegOf(1700, 2200)]) })).ok).toBe(false);
  });
  it("refuses embedded pictures, however they're named", () => {
    const r = vet("x.docx", zip({ ...DOCX, "word/media/image1.png": JPEG }));
    expect(!r.ok && r.reason).toMatch(PICTURES);
    expect(vet("x.docx", zip({ ...DOCX, "word/photo.xml": JPEG })).ok).toBe(false); // image bytes behind an .xml name
    expect(vet("x.docx", zip({ ...DOCX, "word/photo.dat": "hello" })).ok).toBe(false); // non-XML part
    expect(vet("x.docx", zip({ ...DOCX, "word/afchunk.mht": "MIME" })).ok).toBe(false);
  });
  it("refuses linked or encoded pictures in the XML", () => {
    const single = "<Relationships><Relationship Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/image' Target='https://x.test/a.jpg' TargetMode='External'/></Relationships>";
    expect(vet("x.docx", zip({ ...DOCX, "word/_rels/document.xml.rels": single })).ok).toBe(false);
    const linked = '<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://x.test/a.jpg" TargetMode="External"/></Relationships>';
    expect(vet("x.docx", zip({ ...DOCX, "word/_rels/document.xml.rels": linked })).ok).toBe(false);
    expect(vet("x.docx", zip({ ...DOCX, "word/document.xml": `<w:document><v:imagedata src="data:image/png;base64,iVBOR"/></w:document>` })).ok).toBe(false);
  });
  it("refuses zips that only pretend to be documents, or hide extra data", () => {
    expect(vet("x.docx", zip({ "IMG_1.jpg": JPEG })).ok).toBe(false);
    expect(vet("x.docx", zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": "<w/>", "photos/a.xml": "<a/>" })).ok).toBe(false);
    // A second archive (or anything) smuggled in front of the real one.
    const smuggled = zip(DOCX, { prefix: zip({ "a.jpg": JPEG }) });
    expect(vet("x.docx", smuggled).ok).toBe(false);
  });
});

/** A one-page PDF whose content stream is Flate-compressed. */
function pdf(content: string, extraObjects = ""): Uint8Array {
  const stream = deflateSync(enc(content));
  const head = enc(`%PDF-1.7\n1 0 obj << /Type /Page /Contents 2 0 R >> endobj\n${extraObjects}2 0 obj << /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`);
  const tail = enc("\nendstream\nendobj\n%%EOF\n");
  return new Uint8Array([...head, ...stream, ...tail]);
}

describe("PDFs", () => {
  it("accepts text-only PDFs", () => {
    expect(vet("guide.pdf", pdf("BT /F1 12 Tf (Turf: Elm St to 5th Ave) Tj ET", "3 0 obj << /Type /Font /Subtype /Type1 >> endobj\n")).ok).toBe(true);
  });
  it("refuses scanned pages and images, including disguised ones", () => {
    expect(vet("scan.pdf", pdf("q 612 0 0 792 0 0 cm /Im1 Do Q", "3 0 obj << /Type /XObject /Subtype /Image /Width 2550 >> endobj\n")).ok).toBe(false);
    expect(vet("scan.pdf", pdf("q", "3 0 obj <</Subtype/#49mage>> endobj\n")).ok).toBe(false);
    expect(vet("scan.pdf", pdf("q", "3 0 obj <</Subtype%hidden\n/Image>> endobj\n")).ok).toBe(false);
    // An inline image inside the compressed page content.
    expect(vet("scan.pdf", pdf("q BI /W 2550 /H 3300 /BPC 8 /CS /G ID xxxx EI Q")).ok).toBe(false);
    // Inline-image keys can come in any order.
    expect(vet("scan.pdf", pdf("q BI /BPC 8 /CS /G /W 2550 /H 3300 ID xxxx EI Q")).ok).toBe(false);
    expect(vet("scan.pdf", pdf("q BI /H 3300 /W 2550 ID xxxx EI Q")).ok).toBe(false);
    // …right after a delimiter, or after a "%" inside a string (not a comment).
    expect(vet("scan.pdf", pdf("q (x)BI /W 2550 /H 3300 /BPC 8 /CS /G ID xxxx EI Q")).ok).toBe(false);
    expect(vet("scan.pdf", pdf("q [1 2]BI /W 2550 ID xxxx EI Q")).ok).toBe(false);
    expect(vet("scan.pdf", pdf("q (50% off) Tj BI /W 2550 /H 3300 /BPC 8 /CS /G ID xxxx EI Q")).ok).toBe(false);
    // An inline image in the second compressed stream (the first is clean).
    const two = (() => {
      const a = deflateSync(enc("BT (page one) Tj ET"));
      const b = deflateSync(enc("q BI /W 2550 /H 3300 ID xxxx EI Q"));
      const parts = [enc(`%PDF-1.7\n1 0 obj << /Length ${a.length} /Filter /FlateDecode >>\nstream\n`), a, enc(`\nendstream\nendobj\n2 0 obj << /Length ${b.length} /Filter /FlateDecode >>\nstream\n`), b, enc("\nendstream\nendobj\n%%EOF\n")];
      return new Uint8Array(parts.flatMap((p) => [...p]));
    })();
    expect(vet("scan.pdf", two).ok).toBe(false);
    // A picture attached to the PDF.
    expect(vet("scan.pdf", pdf("q", "3 0 obj << /Type /EmbeddedFile >> endobj\n")).ok).toBe(false);
  });
  it("refuses PDFs it can't see into", () => {
    expect(vet("locked.pdf", pdf("q", "9 0 obj << /Encrypt 10 0 R >> endobj\n")).ok).toBe(false);
  });
});

describe("text files", () => {
  it("accepts ordinary notes and CSVs", () => {
    expect(vet("notes.txt", enc("Doors: 120\nContacts: 34\nP1 priority: Elm St\n")).ok).toBe(true);
    expect(vet("shifts.csv", enc("date,doors\n2026-10-01,120\n")).ok).toBe(true);
  });
  it("refuses images written out as text", () => {
    const b64 = Buffer.from(new Uint8Array(3000).map((_, i) => (i * 37) % 256)).toString("base64");
    const wrapped = b64.match(/.{1,76}/g)!.join("\n"); // `base64 sheet.jpg > notes.txt`
    expect(vet("notes.txt", enc(wrapped)).ok).toBe(false);
    expect(vet("notes.txt", enc(b64)).ok).toBe(false);
    expect(vet("x.txt", enc('<svg:svg xmlns:svg="http://www.w3.org/2000/svg"/>')).ok).toBe(false);
    expect(vet("x.txt", enc("P3\n2550 3300\n255\n0 0 0")).ok).toBe(false);
    expect(vet("x.txt", enc("/* XPM */\nstatic char *x[] = {")).ok).toBe(false);
    expect(vet("x.txt", enc("begin 644 sheet.jpg\nM_]C_X``02D9)\n")).ok).toBe(false);
    // A hex dump of an image, wrapped or not.
    const hex = Buffer.from(new Uint8Array(1500).map((_, i) => (i * 37) % 256)).toString("hex");
    expect(vet("x.txt", enc(hex)).ok).toBe(false);
    expect(vet("x.txt", enc(hex.match(/.{1,80}/g)!.join("\n"))).ok).toBe(false);
  });
});
