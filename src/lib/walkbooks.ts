/**
 * File-to-walkbook (W1), the pure half: read an authorized CSV, keep only
 * the address of each row, put the addresses in walking order and cut them
 * into numbered walkbooks. Nothing here touches the database.
 *
 * Address only (CLAUDE.md rule 4). A voter or customer file carries names,
 * party, vote history, phone numbers and more. None of it is read past the
 * header: the columns that aren't address columns are dropped by name before
 * any row is looked at, and only their header names go back to the
 * organization so it can see what was left out. There is no geocoder: a stop
 * has a point on the map only when the file itself gave its latitude and
 * longitude.
 */

import { hasHiddenChars } from "@/lib/text-guard";

export const MAX_FILE_BYTES = 2_000_000;
export const MAX_ROWS = 10_000;
export const MAX_STOPS_PER_BOOK = 500;
export const DEFAULT_STOPS_PER_BOOK = 60;

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export type CsvResult = { ok: true; rows: string[][] } | { ok: false; reason: string };

/**
 * RFC 4180 CSV: quoted fields, doubled quotes inside them, commas and line
 * breaks inside quotes, CRLF or LF line ends, a leading byte-order mark.
 * Blank lines are skipped. Stops at MAX_ROWS + 1 data rows (the header plus
 * one too many is enough to refuse the file).
 */
export function parseCsv(text: string): CsvResult {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let fieldStarted = false;
  const endRow = () => {
    row.push(field);
    if (!(row.length === 1 && row[0].trim() === "")) rows.push(row);
    row = [];
    field = "";
    fieldStarted = false;
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
      fieldStarted = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      endRow();
      if (rows.length > MAX_ROWS + 1) return { ok: true, rows };
    } else {
      field += c;
      fieldStarted = true;
    }
  }
  if (quoted) return { ok: false, reason: "The file ends inside a quoted field. Check that every opening quote has a closing one." };
  if (field !== "" || row.length) endRow();
  return { ok: true, rows };
}

// ---------------------------------------------------------------------------
// Columns: which header is which address part; everything else is dropped
// ---------------------------------------------------------------------------

export type AddressField = "line1" | "houseNumber" | "street" | "unit" | "city" | "state" | "zip" | "lat" | "lng";

/** Header names each address part answers to, compared with case, spaces and punctuation ignored. */
const ALIASES: Record<AddressField, readonly string[]> = {
  line1: ["address", "address1", "addressline1", "streetaddress", "residenceaddress", "residentialaddress", "line1", "addr", "addr1", "siteaddress", "propertyaddress", "mailingaddress1"],
  houseNumber: ["housenumber", "houseno", "housenum", "streetnumber", "streetno", "stnum", "addressnumber"],
  street: ["street", "streetname", "stname", "road"],
  unit: ["unit", "apt", "apartment", "aptnumber", "unitnumber", "suite", "address2", "addressline2", "line2", "addr2"],
  city: ["city", "town", "municipality", "residencecity", "residentialcity", "sitecity"],
  state: ["state", "st", "stateabbr", "statecode", "residencestate", "residentialstate", "sitestate"],
  zip: ["zip", "zipcode", "zip5", "postalcode", "postcode", "residencezip", "residentialzip", "sitezip"],
  lat: ["lat", "latitude", "y"],
  lng: ["lng", "lon", "long", "longitude", "x"],
};

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface ColumnMap {
  /** The column index each address part comes from. */
  index: Partial<Record<AddressField, number>>;
  /** The header names that were dropped, as they were written. */
  dropped: string[];
}

export function mapColumns(headers: string[]): { ok: true; map: ColumnMap } | { ok: false; reason: string } {
  const index: Partial<Record<AddressField, number>> = {};
  const used = new Set<number>();
  for (const field of Object.keys(ALIASES) as AddressField[]) {
    for (const alias of ALIASES[field]) {
      const at = headers.findIndex((h, i) => !used.has(i) && norm(h) === alias);
      if (at >= 0) {
        index[field] = at;
        used.add(at);
        break;
      }
    }
  }
  // A bare "street" column with no house number column is the whole first line.
  if (index.line1 === undefined && index.street !== undefined && index.houseNumber === undefined) {
    index.line1 = index.street;
    delete index.street;
  }
  // A house number without a street (or the reverse) can't make a line.
  if (index.line1 !== undefined || index.houseNumber === undefined || index.street === undefined) {
    for (const f of ["houseNumber", "street"] as const) {
      if (index[f] !== undefined) {
        used.delete(index[f]!);
        delete index[f];
      }
    }
  }
  // A point needs both halves.
  if ((index.lat === undefined) !== (index.lng === undefined)) {
    for (const f of ["lat", "lng"] as const) {
      if (index[f] !== undefined) {
        used.delete(index[f]!);
        delete index[f];
      }
    }
  }
  const missing: string[] = [];
  if (index.line1 === undefined && index.houseNumber === undefined) missing.push("street address");
  if (index.city === undefined) missing.push("city");
  if (index.state === undefined) missing.push("state");
  if (index.zip === undefined) missing.push("ZIP code");
  if (missing.length) {
    return { ok: false, reason: `No ${listWords(missing)} column found. Name the columns (for example "address", "city", "state", "zip") in the file's first row.` };
  }
  const dropped = headers.filter((_, i) => !used.has(i)).map((h) => h.trim() || "(unnamed)");
  return { ok: true, map: { index, dropped } };
}

function listWords(words: string[]): string {
  if (words.length < 2) return words.join("");
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface AddressRow {
  /** The row in the file, 1 = the first row under the header. */
  rowNumber: number;
  line1: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
}

export interface Skipped {
  rowNumber: number;
  reason: string;
}

export interface AddressFile {
  rowCount: number;
  rows: AddressRow[];
  skipped: Skipped[];
  dropped: string[];
  /** Rows with a usable point from the file. */
  withPoint: number;
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function readZip(raw: string): string | null {
  const m = /^(\d{3,5})(?:-\d{4})?$/.exec(raw);
  if (!m) return null;
  // Spreadsheets drop leading zeros (New England, New Jersey, Puerto Rico).
  return m[1].padStart(5, "0");
}

function readCoord(raw: string, limit: number): number | null {
  if (!/^-?\d{1,3}(\.\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Math.abs(n) <= limit ? n : null;
}

/** Reads a whole file: CSV, columns, then each row's address. Address parts only. */
export function readAddressFile(text: string): { ok: true; file: AddressFile } | { ok: false; reason: string } {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) return { ok: false, reason: `The file is over ${MAX_FILE_BYTES / 1_000_000} MB. Split it, or keep only the address columns.` };
  const csv = parseCsv(text);
  if (!csv.ok) return csv;
  if (csv.rows.length < 2) return { ok: false, reason: "The file has no rows under its header." };
  const [headers, ...data] = csv.rows;
  if (data.length > MAX_ROWS) return { ok: false, reason: `The file has more than ${MAX_ROWS.toLocaleString("en-US")} rows. Split it into smaller files.` };
  const mapped = mapColumns(headers);
  if (!mapped.ok) return mapped;
  const { index } = mapped.map;
  const at = (r: string[], f: AddressField) => (index[f] === undefined ? "" : clean(r[index[f]!]));

  const rows: AddressRow[] = [];
  const skipped: Skipped[] = [];
  const seen = new Set<string>();
  data.forEach((r, i) => {
    const rowNumber = i + 1;
    const line1 = index.line1 !== undefined ? at(r, "line1") : clean(`${at(r, "houseNumber")} ${at(r, "street")}`);
    const unit = at(r, "unit");
    const city = at(r, "city");
    const state = at(r, "state").toUpperCase();
    const zipRaw = at(r, "zip");
    if (!line1) return skipped.push({ rowNumber, reason: "No street address." });
    if ([line1, unit, city].some((t) => hasHiddenChars(t))) return skipped.push({ rowNumber, reason: "The address has hidden characters." });
    if (line1.length > 200) return skipped.push({ rowNumber, reason: "The street address is over 200 characters." });
    if (unit.length > 50) return skipped.push({ rowNumber, reason: "The unit is over 50 characters." });
    if (!city || city.length > 100) return skipped.push({ rowNumber, reason: city ? "The city is over 100 characters." : "No city." });
    if (!/^[A-Z]{2}$/.test(state)) return skipped.push({ rowNumber, reason: "The state isn't a two-letter code." });
    const zip = readZip(zipRaw);
    if (!zip) return skipped.push({ rowNumber, reason: "The ZIP code isn't five digits." });
    const key = `${line1.toUpperCase()}|${unit.toUpperCase()}|${zip}`;
    if (seen.has(key)) return skipped.push({ rowNumber, reason: "Same address as an earlier row." });
    seen.add(key);
    let lat: number | null = null;
    let lng: number | null = null;
    if (index.lat !== undefined) {
      lat = readCoord(at(r, "lat"), 90);
      lng = readCoord(at(r, "lng"), 180);
      if (lat === null || lng === null) lat = lng = null;
    }
    rows.push({ rowNumber, line1, unit: unit || null, city, state, zip, lat, lng });
  });
  return { ok: true, file: { rowCount: data.length, rows, skipped, dropped: mapped.map.dropped, withPoint: rows.filter((r) => r.lat !== null).length } };
}

// ---------------------------------------------------------------------------
// What the uploader states about the file
// ---------------------------------------------------------------------------

export interface ImportMeta {
  fileName: string;
  recordSource: string;
  purpose: string;
  license: string;
}

export function validateImportMeta(raw: Record<string, unknown>): { ok: true; value: ImportMeta } | { ok: false; errors: Record<string, string> } {
  const s = (k: string) => clean(typeof raw[k] === "string" ? (raw[k] as string) : "");
  const errors: Record<string, string> = {};
  const fileName = s("fileName").slice(0, 200) || "addresses.csv";
  const recordSource = s("recordSource");
  const purpose = s("purpose");
  const license = s("license");
  if (!recordSource) errors.recordSource = "Say where the file came from (for example, the county voter file, or your own supporter list).";
  else if (recordSource.length > 200) errors.recordSource = "Keep it under 200 characters.";
  if (!purpose) errors.purpose = "Say what the addresses will be used for.";
  else if (purpose.length > 500) errors.purpose = "Keep it under 500 characters.";
  if (!license) errors.license = "Say what license or permission covers this use.";
  else if (license.length > 500) errors.license = "Keep it under 500 characters.";
  if (raw.authorized !== "on" && raw.authorized !== true) errors.authorized = "Confirm your organization is authorized to use this file for this purpose.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { fileName, recordSource, purpose, license } };
}

// ---------------------------------------------------------------------------
// Walking order and cutting
// ---------------------------------------------------------------------------

export interface Walkable {
  id: string;
  line1: string;
  unit: string | null;
  zip: string;
}

/** A leading house number ("123", "123A", "123-B", "123 1/2") and the street after it. */
export function splitHouseNumber(line1: string): { number: number | null; street: string } {
  const m = /^(\d+)(?:-?[A-Za-z](?=\s)|\s+\d\/\d)?\s+(.+)$/.exec(line1.trim());
  if (!m) return { number: null, street: line1.trim().toUpperCase() };
  return { number: Number(m[1]), street: m[2].trim().toUpperCase() };
}

const byText = (a: string, b: string) => a.localeCompare(b, "en-US", { numeric: true });

/**
 * Walking order: by ZIP, then street; along a street, up the odd side and
 * back down the even side, the way a canvasser walks it; then by unit.
 * Addresses without a house number come last on their street.
 */
export function walkOrder<T extends Walkable>(stops: readonly T[]): T[] {
  const keyed = stops.map((s) => ({ s, ...splitHouseNumber(s.line1) }));
  return keyed
    .sort((a, b) => {
      if (a.s.zip !== b.s.zip) return byText(a.s.zip, b.s.zip);
      if (a.street !== b.street) return byText(a.street, b.street);
      const side = (n: number | null) => (n === null ? 2 : n % 2 === 1 ? 0 : 1);
      if (side(a.number) !== side(b.number)) return side(a.number) - side(b.number);
      if (a.number !== null && b.number !== null && a.number !== b.number) return side(a.number) === 0 ? a.number - b.number : b.number - a.number;
      if (a.number === null && a.s.line1 !== b.s.line1) return byText(a.s.line1, b.s.line1);
      return byText(a.s.unit ?? "", b.s.unit ?? "");
    })
    .map((k) => k.s);
}

export function readStopsPerBook(raw: unknown): { ok: true; value: number } | { ok: false; reason: string } {
  const t = String(raw ?? "").trim();
  const n = Number(t);
  if (!/^\d+$/.test(t) || n < 1 || n > MAX_STOPS_PER_BOOK) return { ok: false, reason: `Stops per walkbook must be a whole number from 1 to ${MAX_STOPS_PER_BOOK}.` };
  return { ok: true, value: n };
}

export interface CutBook<T> {
  number: number;
  name: string;
  stops: T[];
}

/** Cuts stops (already in walking order) into books of at most `perBook`, numbered from `firstNumber`. */
export function cutBooks<T extends Walkable>(ordered: readonly T[], perBook: number, firstNumber: number): CutBook<T>[] {
  const books: CutBook<T>[] = [];
  for (let i = 0; i < ordered.length; i += perBook) {
    const stops = ordered.slice(i, i + perBook);
    const number = firstNumber + books.length;
    books.push({ number, name: bookName(number, stops), stops });
  }
  return books;
}

/** "Book 3 · Elm St to Oak Ave": the first and last streets, so a book can be told apart at a glance. */
export function bookName(number: number, stops: readonly Walkable[]): string {
  const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const first = stops.length ? title(splitHouseNumber(stops[0].line1).street) : "";
  const last = stops.length ? title(splitHouseNumber(stops[stops.length - 1].line1).street) : "";
  const where = !first ? "" : first === last ? ` · ${first}` : ` · ${first} to ${last}`;
  const name = `Book ${number}${where}`;
  return name.length <= 100 ? name : `${name.slice(0, 99)}…`;
}

/** One line for an address as a canvasser reads it. */
export function addressLine(a: { line1: string; unit: string | null; city: string; state: string; zip: string }): string {
  return `${a.line1}${a.unit ? `, ${a.unit}` : ""}, ${a.city}, ${a.state} ${a.zip}`;
}
