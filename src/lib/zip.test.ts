import { describe, expect, it } from "vitest";
import { crc32 } from "node:zlib";
import { csvTable, zipFile } from "./zip";

/** Reads a stored ZIP back through its central directory. */
function entries(zip: Uint8Array) {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.length - 22;
  expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const out: Array<{ name: string; text: string }> = [];
  for (let i = 0; i < count; i++) {
    expect(dv.getUint32(off, true)).toBe(0x02014b50);
    const crc = dv.getUint32(off + 16, true);
    const size = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const local = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(zip.subarray(off + 46, off + 46 + nameLen));
    expect(dv.getUint32(local, true)).toBe(0x04034b50);
    const localNameLen = dv.getUint16(local + 26, true);
    const localExtra = dv.getUint16(local + 28, true);
    const data = zip.subarray(local + 30 + localNameLen + localExtra, local + 30 + localNameLen + localExtra + size);
    expect(crc32(data)).toBe(crc);
    out.push({ name, text: new TextDecoder().decode(data) });
    off += 46 + nameLen;
  }
  return out;
}

describe("data export files (M7)", () => {
  it("writes a ZIP whose entries read back byte for byte, with UTF-8 names and bodies", () => {
    const files = [
      { name: "README.txt", text: "hello\n" },
      { name: "préférences.json", text: JSON.stringify({ name: "Zoë", emoji: "🗳️" }) },
      { name: "empty.csv", text: "" },
    ];
    expect(entries(zipFile(files))).toEqual(files);
    expect(entries(zipFile([]))).toEqual([]);
  });

  it("CSV: every cell quoted, quotes doubled, dates as ISO, objects as JSON, formulas defused", () => {
    const csv = csvTable([
      { id: 1, name: 'Ann "Q" Lee', at: new Date("2026-09-28T09:00:00Z"), payload: { count: 3 }, note: "=SUM(A1)", empty: null },
      { id: 2, name: "Bo", extra: "x", amount: -500, note: "-not a number" },
    ]);
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe('"id","name","at","payload","note","empty","extra","amount"');
    expect(lines[1]).toBe('"1","Ann ""Q"" Lee","2026-09-28T09:00:00.000Z","{""count"":3}","\'=SUM(A1)","","",""');
    // a negative number stays a number; a dash-led string is defused
    expect(lines[2]).toBe('"2","Bo","","","\'-not a number","","x","-500"');
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csvTable([{ a: 1 }], ["a", "b"]).split("\r\n")[0]).toBe('\uFEFF"a","b"');
  });
});
