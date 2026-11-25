/**
 * File-to-walkbook (W1), the pure half: read an authorized CSV, keep each
 * row's address, its source record ID and every other column, put the
 * addresses in walking order and cut them into numbered walkbooks. Nothing
 * here touches the database.
 *
 * Caden decided (Nov 17 2026) to keep every column and the source record ID,
 * so the firm's return file can be matched. A voter or customer file carries
 * names, party, vote history and phone numbers: the most sensitive data in
 * the system. They are stored on the address row (sourceData), deleted with
 * it after 30 days, and never leave the importer, the purge and the staff
 * export: not to a worker's phone, not to matching, scoring or ranking
 * (CLAUDE.md rules 4 and 5; src/lib/walkbook-isolation.test.ts). Columns that
 * are only a liability (government ID numbers, birth dates, payment and
 * password columns) are never stored, whatever the file says. There is no
 * geocoder: a stop has a point on the map only when the file itself gave its
 * latitude and longitude.
 */

import { HIDDEN_CHARS, hasHiddenChars } from "@/lib/text-guard";

export const MAX_FILE_BYTES = 2_000_000;
export const MAX_ROWS = 10_000;
export const MAX_STOPS_PER_BOOK = 500;
export const DEFAULT_STOPS_PER_BOOK = 60;
/** Not-stored column names recorded per import; the rest are counted. */
export const MAX_DROPPED_SHOWN = 200;
/** Columns kept in a row's sourceData, and the most one value holds. */
export const MAX_STORED_COLUMNS = 60;
export const MAX_VALUE_CHARS = 500;
/** What a row's sourceData may weigh; the database refuses more than 16,384 bytes of its own JSON text, which spaces out a little. */
export const MAX_SOURCE_DATA_BYTES = 15_000;
/** Days until a file's names and addresses are deleted. */
export const RETENTION_DAYS = 30;

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export type CsvResult = { ok: true; rows: string[][]; lines: number[] } | { ok: false; reason: string };

/**
 * RFC 4180 CSV: quoted fields, doubled quotes inside them, commas and line
 * breaks inside quotes, CRLF or LF line ends, a leading byte-order mark.
 * Blank lines are skipped. `lines[i]` is the line of the file row i starts
 * on (the header is line 1), so a skipped row can be named the way the
 * uploader's spreadsheet numbers it. Stops at MAX_ROWS + 1 data rows (the
 * header plus one too many is enough to refuse the file).
 */
export function parseCsv(text: string): CsvResult {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let fieldStarted = false;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    row.push(field);
    if (!(row.length === 1 && row[0].trim() === "")) {
      rows.push(row);
      lines.push(rowLine);
    }
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
      } else {
        if (c === "\n" || (c === "\r" && src[i + 1] !== "\n")) line++;
        field += c;
      }
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
      line++;
      rowLine = line;
      if (rows.length > MAX_ROWS + 1) return { ok: true, rows, lines };
    } else {
      field += c;
      fieldStarted = true;
    }
  }
  if (quoted) return { ok: false, reason: "The file ends inside a quoted field. Check that every opening quote has a closing one." };
  if (fieldStarted || row.length) endRow();
  return { ok: true, rows, lines };
}

// ---------------------------------------------------------------------------
// Columns: which header is which address part, which is the record ID; the rest are kept
// ---------------------------------------------------------------------------

export type AddressField = "line1" | "houseNumber" | "street" | "unit" | "city" | "state" | "zip" | "lat" | "lng";

/** Header names each address part answers to, compared with case, spaces and punctuation ignored. */
const ALIASES: Record<AddressField, readonly string[]> = {
  line1: ["address", "address1", "addressline1", "streetaddress", "residenceaddress", "residentialaddress", "line1", "addr", "addr1", "siteaddress", "propertyaddress", "homeaddress", "physicaladdress", "primaryaddress", "address01"],
  houseNumber: ["housenumber", "houseno", "housenum", "streetnumber", "streetno", "stnum", "addressnumber"],
  street: ["street", "streetname", "stname", "road"],
  unit: ["unit", "apt", "apartment", "aptnumber", "unitnumber", "suite", "address2", "addressline2", "line2", "addr2"],
  city: ["city", "town", "municipality", "residencecity", "residentialcity", "sitecity", "homecity", "physicalcity"],
  state: ["state", "st", "stateabbr", "statecode", "residencestate", "residentialstate", "sitestate", "homestate", "physicalstate"],
  zip: ["zip", "zipcode", "zip5", "postalcode", "postcode", "residencezip", "residentialzip", "sitezip", "homezip", "physicalzip"],
  lat: ["lat", "latitude"],
  lng: ["lng", "lon", "longitude"],
};

/** The source system's own id for a row, most specific first: Ecanvasser Contact ID, VanID, a voter file ID. A bare "id" is the last resort. */
const RECORD_ID_ALIASES: readonly string[] = ["vanid", "myvoterid", "contactid", "ecanvasserid", "ecanvassercontactid", "recordid", "sourceid", "externalid", "pdiid", "personid", "voterid", "statevoterid", "voterfileid", "id"];

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Headers that are never stored: government ID numbers, birth dates, payment
 * and password columns. They are risk without use here (matching a return
 * file needs the record ID, not these), and Arizona protects several of them
 * by name.
 *
 * Matched on the header's words, not on a substring, so "Business Name" isn't
 * caught by "ssn": the header is split on punctuation and camelCase ("DateOf
 * Birth" -> date of birth), and a word matches an abbreviation exactly or
 * with digits after it ("SSN4"). Multi-word names ("Social Security",
 * "License Number") are matched on the squeezed header.
 */
const NEVER_WORD = /^(ssn|ss|sin|itin|tin|ein|dob|dl|dln|pin|pwd|passwd|password|passphrase|token|secret|cvv|cvc|iban|acct|account|born|birth|birthdate|birthday|dateofbirth|social|socsec|passport|routing|license|licence|lic|card|cc)\d*$/;
const NEVER_SQUEEZED = ["socialsecurity", "socsec", "socialsec", "driverlic", "driverslic", "licensenumber", "licensenum", "licenseno", "licencenumber", "licenceno", "licnum", "licno", "govtid", "governmentid", "stateid", "idnumber", "idnum", "taxid", "taxpayer", "creditcard", "cardnumber", "cardno", "ccnumber", "ccnum", "bankaccount", "accountnumber", "accountno", "acctnumber", "acctno", "dateofbirth", "yearborn", "birthyear", "birthdate", "lastfour", "last4"];
export function isNeverStored(header: string): boolean {
  const words = header
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.some((w) => NEVER_WORD.test(w))) return true;
  const squeezed = words.join("");
  // "D.O.B" and "S.S.N." split into single letters; squeezed back they are the abbreviation, matched exactly (never as a substring: "Adobe").
  if (["dob", "dl", "ssn", "ss", "sin", "tin", "ein", "pin"].includes(squeezed)) return true;
  return NEVER_SQUEEZED.some((x) => squeezed.includes(x));
}

/** Luhn check, for spotting a card number in a free-text column. */
function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1 && (d *= 2) > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * A value that looks like a Social Security number (123-45-6789) or a payment
 * card number (13-19 digits passing the Luhn check). A free-text column ("Notes")
 * can hold either; the value is left out rather than stored.
 */
export function looksLikeGovIdOrCard(value: string): boolean {
  if (/(?<!\d)\d{3}[- ]\d{2}[- ]\d{4}(?!\d)/.test(value)) return true;
  for (const m of value.matchAll(/(?<![\d])(?:\d[ -]?){13,19}(?!\d)/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return true;
  }
  return false;
}

export interface ColumnMap {
  /** The column index each address part comes from. */
  index: Partial<Record<AddressField, number>>;
  /** The column the source record ID comes from, if the file has one. */
  recordId?: number;
  /** The other columns that are stored, in file order: index and a clean, unique name. */
  stored: Array<{ at: number; name: string }>;
  /** Headers never stored (government ID, birth date, payment, password) and headers beyond the column cap. */
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
  // The record ID: the first alias present, most specific first.
  let recordId: number | undefined;
  for (const alias of RECORD_ID_ALIASES) {
    const found = headers.findIndex((h, i) => !used.has(i) && norm(h) === alias);
    if (found >= 0) {
      recordId = found;
      used.add(found);
      break;
    }
  }
  // Everything else is kept, with clean unique names, unless it is on the never-stored list or past the column cap.
  // Every name handed out is reserved, so "Notes, Notes, Notes (2)" can't give two columns the same key (one value
  // would silently overwrite the other). The unit column's own header is reserved too: a second line that isn't a
  // unit is stored under that name.
  const taken = new Set<string>(index.unit !== undefined ? [headerName(headers[index.unit]).toLowerCase()] : []);
  const stored: Array<{ at: number; name: string }> = [];
  const dropped: string[] = [];
  headers.forEach((h, i) => {
    if (used.has(i)) return;
    const name = headerName(h);
    if (isNeverStored(h)) return void dropped.push(name);
    if (stored.length >= MAX_STORED_COLUMNS) return void dropped.push(name);
    let unique = name;
    for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = `${name} (${n})`;
    taken.add(unique.toLowerCase());
    stored.push({ at: i, name: unique });
  });
  const shown = dropped.length > MAX_DROPPED_SHOWN ? [...dropped.slice(0, MAX_DROPPED_SHOWN), `+${dropped.length - MAX_DROPPED_SHOWN} more`] : dropped;
  return { ok: true, map: { index, recordId, stored, dropped: shown } };
}

/** A dropped column's name as it is recorded: hidden characters out, at most 100 characters. */
function headerName(h: string): string {
  const t = h.replace(LONE_SURROGATE, "").replace(new RegExp(HIDDEN_CHARS.source, "gu"), "").replace(/\s+/g, " ").trim();
  if (!t) return "(unnamed)";
  return Array.from(t).length > 100 ? `${cutChars(t, 99)}…` : t;
}

function listWords(words: string[]): string {
  if (words.length < 2) return words.join("");
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface AddressRow {
  /** The line of the file the row starts on (the header is line 1), as a spreadsheet numbers it. */
  rowNumber: number;
  line1: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  /** The source system's id for the row (a VanID, an Ecanvasser Contact ID); null when the file has none or it is blank. */
  sourceRecordId: string | null;
  /** Every other column of the row, header to value, empty values left out. Null when there are none. */
  sourceData: Record<string, string> | null;
}

export interface Skipped {
  rowNumber: number;
  reason: string;
}

export interface AddressFile {
  rowCount: number;
  rows: AddressRow[];
  skipped: Skipped[];
  /** Headers not stored: government ID, birth date, payment and password columns, and columns past the cap or cut to fit a row. */
  dropped: string[];
  /** The headers kept in each row's sourceData, in file order. */
  storedColumns: string[];
  /** The header the record ID came from, or null. */
  recordIdColumn: string | null;
  /** Rows with a usable point from the file. */
  withPoint: number;
  /** Rows whose second address line wasn't a unit: it is kept as a column of its own, not as the unit (it may hold "C/O …"). */
  unitsLeftOff: number;
  /** The states the addresses are in, sorted (Arizona restricts voter-list data online). */
  states: string[];
  /** Values left out because they looked like a Social Security or card number (a free-text column can hold either). */
  valuesLeftOut: number;
}

/** A half of a surrogate pair on its own (an emoji cut in two): it can't be written as JSON or UTF-8, and would fail the whole import. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
/** At most `n` characters, counted as people count them (an emoji is one), never cutting one in half. */
const cutChars = (t: string, n: number) => {
  const chars = Array.from(t);
  return chars.length > n ? chars.slice(0, n).join("") : t;
};
const clean = (s: string | undefined) => (s ?? "").replace(LONE_SURROGATE, "").replace(/\s+/g, " ").trim();

function readZip(raw: string): string | null {
  // ZIP+4 with or without the hyphen; a spreadsheet's number ("2138.0") too.
  const t = raw.replace(/\.0+$/, "");
  const m = /^(\d{3,5})(?:-?\d{4})?$/.exec(t);
  if (m && t.length === 9 && !t.includes("-")) return t.slice(0, 5);
  if (!m) return null;
  // Spreadsheets drop leading zeros (New England, New Jersey, Puerto Rico).
  return m[1].padStart(5, "0");
}

/**
 * A second address line is the unit only when it is shaped like one ("Apt 2",
 * "Unit 4B", "#3", "Ste 100", "2F"). Mailing files put other things there, a
 * name above all ("C/O Jane Doe", "Attn: …"); that value is kept as a column
 * of its own with the rest of the row's data, never as part of the address a
 * canvasser is sent to.
 */
const UNIT_WORDS = "apt|apartment|unit|ste|suite|bldg|building|fl|floor|rm|room|lot|spc|space|trlr|ph|penthouse|bsmt|basement|dept|no|num|number";
const UNIT_SHAPE = new RegExp(`^(?:(?:${UNIT_WORDS})\\.?\\s*#?\\s*(?:\\d[0-9a-z]{0,5}|[a-z]\\d{0,4})(?:-[0-9a-z]{1,6})?|#\\s*[0-9a-z]{1,6}(?:-[0-9a-z]{1,6})?|\\d{1,6}[a-z]?|[a-z]\\d{0,4}|\\d{1,3}(?:st|nd|rd|th)\\s+(?:fl|floor)|(?:upper|lower|rear|front|side|uppr|lowr|frnt))$`, "i");
export const isUnitShaped = (u: string) => UNIT_SHAPE.test(u);

function readCoord(raw: string, limit: number): number | null {
  if (!/^-?\d{1,3}(\.\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Math.abs(n) <= limit ? n : null;
}

const stripHidden = new RegExp(HIDDEN_CHARS.source, "gu");
const bytes = (t: string) => new TextEncoder().encode(t).length;

/**
 * A row's other columns as header -> value: values trimmed and cut at
 * MAX_VALUE_CHARS, hidden and control characters out (a NUL can't be stored
 * as JSON), empty values left out. If the row would weigh more than
 * MAX_SOURCE_DATA_BYTES, columns are dropped from the end until it fits; the
 * names of any dropped are returned so the import can say so.
 */
export function buildSourceData(entries: ReadonlyArray<readonly [string, string]>): { data: Record<string, string> | null; cut: string[]; leftOut: number } {
  const kept: Array<[string, string]> = [];
  let leftOut = 0;
  for (const [name, raw] of entries) {
    const v = cutChars(raw.replace(LONE_SURROGATE, "").replace(stripHidden, "").replace(/\s+/g, " ").trim(), MAX_VALUE_CHARS);
    if (!v) continue;
    // A free-text column can hold an SSN or a card number: that value is left out, and counted.
    if (looksLikeGovIdOrCard(v)) {
      leftOut++;
      continue;
    }
    kept.push([name, v]);
  }
  let size = 2 + kept.reduce((n, [k, v]) => n + bytes(JSON.stringify(k)) + bytes(JSON.stringify(v)) + 4, 0);
  const cut: string[] = [];
  while (size > MAX_SOURCE_DATA_BYTES && kept.length) {
    const [k, v] = kept.pop()!;
    size -= bytes(JSON.stringify(k)) + bytes(JSON.stringify(v)) + 4;
    cut.push(k);
  }
  return { data: kept.length ? Object.fromEntries(kept) : null, cut, leftOut };
}

/** Reads a whole file: CSV, columns, then each row's address, record ID and other columns. */
export function readAddressFile(text: string): { ok: true; file: AddressFile } | { ok: false; reason: string } {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) return { ok: false, reason: `The file is over ${MAX_FILE_BYTES / 1_000_000} MB. Split it, or keep only the address columns.` };
  const csv = parseCsv(text);
  if (!csv.ok) return csv;
  const lineOf = csv.lines;
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
  const seenIds = new Set<string>();
  const cutNames = new Set<string>();
  let unitsLeftOff = 0;
  let valuesLeftOut = 0;
  const unitHeader = index.unit !== undefined ? headerName(headers[index.unit]) : null;
  data.forEach((r, i) => {
    const rowNumber = lineOf[i + 1];
    const line1 = index.line1 !== undefined ? at(r, "line1") : clean(`${at(r, "houseNumber")} ${at(r, "street")}`);
    let unit = at(r, "unit");
    // A second line that isn't a unit stays in the row's data, under its own header.
    let notAUnit: string | null = null;
    if (unit && !isUnitShaped(unit)) {
      notAUnit = unit;
      unit = "";
      unitsLeftOff++;
    }
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
    const key = addressKey({ line1, unit, zip });
    if (seen.has(key)) return skipped.push({ rowNumber, reason: "Same address as an earlier row." });
    let sourceRecordId: string | null = null;
    if (mapped.map.recordId !== undefined) {
      const id = clean(r[mapped.map.recordId]);
      if (id.length > 100 || hasHiddenChars(id)) return skipped.push({ rowNumber, reason: "The record ID is over 100 characters or has hidden characters." });
      if (id) {
        if (seenIds.has(id)) return skipped.push({ rowNumber, reason: "Same record ID as an earlier row." });
        seenIds.add(id);
        sourceRecordId = id;
      }
    }
    seen.add(key);
    let lat: number | null = null;
    let lng: number | null = null;
    if (index.lat !== undefined) {
      lat = readCoord(at(r, "lat"), 90);
      lng = readCoord(at(r, "lng"), 180);
      if (lat === null || lng === null) lat = lng = null;
    }
    const extra = mapped.map.stored.map((c) => [c.name, r[c.at] ?? ""] as const);
    if (notAUnit && unitHeader) extra.push([unitHeader, notAUnit]);
    const sd = buildSourceData(extra);
    for (const c of sd.cut) cutNames.add(c);
    valuesLeftOut += sd.leftOut;
    rows.push({ rowNumber, line1, unit: unit || null, city, state, zip, lat, lng, sourceRecordId, sourceData: sd.data });
  });
  if (!rows.length) {
    const first = skipped[0];
    return { ok: false, reason: `No row in the file has a usable address${first ? ` (line ${first.rowNumber}: ${first.reason})` : ""}.` };
  }
  // A column cut to make one row fit goes from every row: the import lists it as not stored, and that must be true.
  if (cutNames.size) {
    for (const row of rows) {
      if (!row.sourceData) continue;
      for (const name of cutNames) delete row.sourceData[name];
      if (!Object.keys(row.sourceData).length) row.sourceData = null;
    }
  }
  const dropped = [...mapped.map.dropped, ...[...cutNames].filter((n) => !mapped.map.dropped.includes(n))];
  return {
    ok: true,
    file: {
      rowCount: data.length,
      rows,
      skipped,
      dropped,
      storedColumns: mapped.map.stored.map((c) => c.name).filter((n) => !cutNames.has(n)),
      recordIdColumn: mapped.map.recordId !== undefined ? headerName(headers[mapped.map.recordId]) : null,
      withPoint: rows.filter((r) => r.lat !== null).length,
      unitsLeftOff,
      states: [...new Set(rows.map((r) => r.state))].sort(),
      valuesLeftOut,
    },
  };
}

/** One door within a file: the same first line, unit and ZIP, ignoring case. Across files on a job, the rule is notOnJob in walkbooks-data.ts. */
export const addressKey = (a: { line1: string; unit: string | null; zip: string }) => `${a.line1.toUpperCase()}|${(a.unit ?? "").toUpperCase()}|${a.zip}`;

// ---------------------------------------------------------------------------
// What the uploader states about the file
// ---------------------------------------------------------------------------

export const SOURCE_SYSTEMS = [
  { value: "ECANVASSER", label: "Ecanvasser" },
  { value: "VAN", label: "VAN / MiniVAN" },
  { value: "PDI", label: "PDI" },
  { value: "OTHER", label: "Another system or list" },
] as const;
export type SourceSystem = (typeof SOURCE_SYSTEMS)[number]["value"];

/** Arizona law limits voter-list data to political use and bars posting it online (A.R.S. 16-168); an Arizona file needs its own acknowledgement. */
export const NEEDS_STATE_ACK = ["AZ"] as const;

export interface ImportMeta {
  fileName: string;
  recordSource: string;
  purpose: string;
  license: string;
  sourceSystem: SourceSystem | null;
}

export function validateImportMeta(raw: Record<string, unknown>): { ok: true; value: ImportMeta } | { ok: false; errors: Record<string, string> } {
  const s = (k: string) => clean(typeof raw[k] === "string" ? (raw[k] as string) : "");
  const errors: Record<string, string> = {};
  const fileName = s("fileName").replace(new RegExp(HIDDEN_CHARS.source, "gu"), "").slice(0, 200).trim() || "addresses.csv";
  const recordSource = s("recordSource");
  const purpose = s("purpose");
  const license = s("license");
  if (!recordSource) errors.recordSource = "Say where the file came from (for example, the county voter file, or your own supporter list).";
  else if (recordSource.length > 200) errors.recordSource = "Keep it under 200 characters.";
  if (!purpose) errors.purpose = "Say what the addresses will be used for.";
  else if (purpose.length > 500) errors.purpose = "Keep it under 500 characters.";
  if (!license) errors.license = "Say what license or permission covers this use.";
  else if (license.length > 500) errors.license = "Keep it under 500 characters.";
  for (const [k, v] of Object.entries({ recordSource, purpose, license })) if (!errors[k] && hasHiddenChars(v)) errors[k] = "Remove the hidden characters.";
  if (raw.authorized !== "on" && raw.authorized !== true) errors.authorized = "Confirm your organization is authorized to use this file for this purpose.";
  const sys = s("sourceSystem");
  if (sys && !SOURCE_SYSTEMS.some((x) => x.value === sys)) errors.sourceSystem = "Pick one of the systems listed, or leave it empty.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { fileName, recordSource, purpose, license, sourceSystem: (sys || null) as SourceSystem | null } };
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

/** A leading house number ("123", "123A", "123-B", "123 1/2", "12-14": 12) and the street after it. */
export function splitHouseNumber(line1: string): { number: number | null; street: string } {
  const m = /^(\d+)(?:-\d+(?=\s)|-?[A-Za-z](?=\s)|\s+\d\/\d)?\s+(.+)$/.exec(line1.trim());
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
      if (a.s.line1 !== b.s.line1) return byText(a.s.line1, b.s.line1);
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
  if (!Number.isInteger(perBook) || perBook < 1 || perBook > MAX_STOPS_PER_BOOK) throw new Error(`cutBooks: perBook must be 1–${MAX_STOPS_PER_BOOK}`);
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
  // Counted as people count characters, so an emoji at the cut is never split in half.
  return Array.from(name).length <= 100 ? name : `${cutChars(name, 99)}…`;
}

/** One line for an address as a canvasser reads it. */
export function addressLine(a: { line1: string; unit: string | null; city: string; state: string; zip: string }): string {
  return `${a.line1}${a.unit ? `, ${a.unit}` : ""}, ${a.city}, ${a.state} ${a.zip}`;
}
