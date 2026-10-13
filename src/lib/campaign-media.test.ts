import { describe, expect, it } from "vitest";
import { stripJpegMetadata, stripPngMetadata } from "./campaign-media";

const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const has = (b: Uint8Array, s: string) => new TextDecoder("latin1").decode(b).includes(s);

describe("campaign images lose what the camera wrote", () => {
  it("drops a JPEG's EXIF (with GPS), XMP and comments, and keeps the picture", () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      ...seg(0xe0, ascii("JFIF\0")),
      ...seg(0xe1, ascii("Exif\0\0GPSLatitude39.7392")),
      ...seg(0xe2, ascii("ICC_PROFILE\0")),
      ...seg(0xfe, ascii("shot at home")),
      ...seg(0xdb, [0, 1, 2]),
      ...seg(0xc0, [8, 0, 64, 0, 64, 1, 1, 0x11, 0]),
      ...seg(0xda, [1, 1, 0, 0, 63, 0]),
      0x12, 0x34, 0xff, 0x00, 0x56,
      0xff, 0xd9,
    ]);
    const out = stripJpegMetadata(jpeg)!;
    expect(out).not.toBeNull();
    expect(has(out, "GPSLatitude")).toBe(false);
    expect(has(out, "shot at home")).toBe(false);
    expect(has(out, "JFIF")).toBe(true);
    expect(has(out, "ICC_PROFILE")).toBe(true);
    expect([...out.slice(-7)]).toEqual([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9]);
    // A phone's second image after the end (with its own EXIF), a comment between scans, appended data: all gone.
    const second = [0xff, 0xd8, ...seg(0xe1, ascii("Exif\0\0GPSLongitude-104.99")), 0xff, 0xd9];
    const progressive = new Uint8Array([...jpeg.slice(0, -2), ...seg(0xfe, ascii("between scans")), ...seg(0xda, [1, 1, 0, 0, 63, 0]), 0x77, 0xff, 0xd0, 0x78, 0xff, 0xd9, ...second, ...ascii("appended")]);
    const out2 = stripJpegMetadata(progressive)!;
    expect(has(out2, "GPSLongitude") || has(out2, "between scans") || has(out2, "appended") || has(out2, "Exif")).toBe(false);
    expect([...out2.slice(-6)]).toEqual([0x77, 0xff, 0xd0, 0x78, 0xff, 0xd9]);
    expect(stripJpegMetadata(new Uint8Array([0xff, 0xd8, 0x00]))).toBeNull();
    expect(stripJpegMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]))).toBeNull();
  });

  it("drops a PNG's text and EXIF chunks, and keeps the picture", () => {
    const chunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...ascii(type), ...data, 0, 0, 0, 0];
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", Array(13).fill(1)), ...chunk("tEXt", ascii("Author\0Maya")), ...chunk("eXIf", ascii("GPS")), ...chunk("IDAT", [9, 9]), ...chunk("IEND", [])]);
    const out = stripPngMetadata(png)!;
    expect(has(out, "Maya")).toBe(false);
    expect(has(out, "eXIf")).toBe(false);
    expect(has(out, "IHDR") && has(out, "IDAT") && has(out, "IEND")).toBe(true);
    expect(stripPngMetadata(png.slice(0, png.length - 6))).toBeNull();
  });
});
