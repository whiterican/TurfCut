import { crc32 } from "node:zlib";

/**
 * A plain ZIP file (entries stored, not compressed) — enough for a data
 * export of JSON and CSV text, and the worker's photos, without adding a dependency. Node 22's
 * zlib.crc32 supplies the checksum the format needs.
 */
/** An entry is text, or raw bytes when `bytes` is given. */
export function zipFile(entries: Array<{ name: string; text?: string; bytes?: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const le = (v: number, n: number) => {
    const b = new Uint8Array(n);
    for (let i = 0; i < n; i++) b[i] = (v >>> (8 * i)) & 0xff;
    return b;
  };
  const cat = (...xs: Uint8Array[]) => {
    const out = new Uint8Array(xs.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of xs) {
      out.set(x, o);
      o += x.length;
    }
    return out;
  };
  // DOS time/date fields: fixed to 1980-01-01 00:00 (the export carries real times inside).
  const dosTime = le(0, 2), dosDate = le(0x21, 2);
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = e.bytes ?? enc.encode(e.text ?? "");
    const crc = crc32(data);
    // UTF-8 names (general purpose bit 11).
    const local = cat(le(0x04034b50, 4), le(20, 2), le(0x0800, 2), le(0, 2), dosTime, dosDate, le(crc, 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2), name, data);
    central.push(cat(le(0x02014b50, 4), le(20, 2), le(20, 2), le(0x0800, 2), le(0, 2), dosTime, dosDate, le(crc, 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(offset, 4), name));
    parts.push(local);
    offset += local.length;
  }
  const cd = cat(...central);
  const end = cat(le(0x06054b50, 4), le(0, 2), le(0, 2), le(entries.length, 2), le(entries.length, 2), le(cd.length, 4), le(offset, 4), le(0, 2));
  return cat(...parts, cd, end);
}

/** A CSV table from rows of plain values (every cell quoted; formulas defused). */
export function csvTable(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return "﻿" + [cols.map(cell).join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}
