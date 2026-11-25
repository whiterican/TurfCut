import { describe, expect, it } from "vitest";
import {
  addressLine,
  buildSourceData,
  looksLikeGovIdOrCard,
  isNeverStored,
  MAX_SOURCE_DATA_BYTES,
  MAX_VALUE_CHARS,
  bookName,
  cutBooks,
  mapColumns,
  MAX_ROWS,
  parseCsv,
  readAddressFile,
  readStopsPerBook,
  splitHouseNumber,
  validateImportMeta,
  walkOrder,
} from "@/lib/walkbooks";

describe("parseCsv", () => {
  it("reads quotes, doubled quotes, commas and line breaks inside quotes, CRLF and a BOM", () => {
    const r = parseCsv('﻿a,b,c\r\n"1, Elm","say ""hi""","two\nlines"\r\n\r\nx,,z');
    expect(r).toEqual({ ok: true, rows: [["a", "b", "c"], ["1, Elm", 'say "hi"', "two\nlines"], ["x", "", "z"]], lines: [1, 2, 5] });
  });
  it("refuses an unterminated quote", () => {
    expect(parseCsv('a,b\n"open,1').ok).toBe(false);
  });
  it("keeps a trailing empty field", () => {
    expect(parseCsv("a,b,\n")).toEqual({ ok: true, rows: [["a", "b", ""]], lines: [1] });
  });
  it("keeps a last record that ends in an empty quoted field with no newline", () => {
    expect(parseCsv('a,b\nx,""')).toEqual({ ok: true, rows: [["a", "b"], ["x", ""]], lines: [1, 2] });
  });
});

describe("mapColumns", () => {
  it("finds the address columns and the record ID, and keeps every other column by name", () => {
    const r = mapColumns(["Voter ID", "First Name", "Party", "Residence Address", "Apt", "City", "State", "Zip Code", "2024 General", "Phone"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.map.index).toEqual({ line1: 3, unit: 4, city: 5, state: 6, zip: 7 });
    expect(r.map.recordId).toBe(0);
    expect(r.map.stored.map((c) => c.name)).toEqual(["First Name", "Party", "2024 General", "Phone"]);
    expect(r.map.dropped).toEqual([]);
  });
  it("picks the most specific record ID column, and a bare 'id' only as a last resort", () => {
    const a = mapColumns(["id", "VANID", "address", "city", "state", "zip"]);
    expect(a.ok && a.map.recordId).toBe(1);
    expect(a.ok && a.map.stored.map((c) => c.name)).toEqual(["id"]);
    const b = mapColumns(["Ecanvasser Contact ID", "address", "city", "state", "zip"]);
    expect(b.ok && b.map.recordId).toBe(0);
    const c = mapColumns(["id", "address", "city", "state", "zip"]);
    expect(c.ok && c.map.recordId).toBe(0);
    const none = mapColumns(["address", "city", "state", "zip"]);
    expect(none.ok && none.map.recordId).toBeUndefined();
  });
  it("never stores a government ID, a birth date, or a payment or password column, and says which it left out", () => {
    const r = mapColumns(["address", "city", "state", "zip", "SSN", "Driver License #", "Date of Birth", "birth_year", "DOB", "Password", "Credit Card Number", "Phone", "Party"]);
    expect(r.ok && r.map.dropped).toEqual(["SSN", "Driver License #", "Date of Birth", "birth_year", "DOB", "Password", "Credit Card Number"]);
    expect(r.ok && r.map.stored.map((c) => c.name)).toEqual(["Phone", "Party"]);
    expect(isNeverStored("Voter ID")).toBe(false);
    expect(isNeverStored("2024 General")).toBe(false);
  });
  it("gives repeated headers their own names, and keeps at most 60 columns", () => {
    const r = mapColumns(["address", "city", "state", "zip", "Note", "note", ...Array.from({ length: 70 }, (_, i) => `col${i}`)]);
    expect(r.ok && r.map.stored.slice(0, 2).map((c) => c.name)).toEqual(["Note", "note (2)"]);
    expect(r.ok && r.map.stored.length).toBe(60);
    expect(r.ok && r.map.dropped.length).toBe(12);
  });
  it("never gives two stored columns the same name, even when a header already reads like a generated one", () => {
    const r = mapColumns(["address", "city", "state", "zip", "Notes", "Notes", "Notes (2)"]);
    const names = r.ok ? r.map.stored.map((c) => c.name.toLowerCase()) : [];
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
    // The unit column's header is reserved: its non-unit second lines are stored under that name.
    const u = mapColumns(["address", "unit", "city", "state", "zip", "Unit"]);
    expect(u.ok && u.map.stored.map((c) => c.name)).toEqual(["Unit (2)"]);
  });
  it("joins a house number and street name when there is no full address column", () => {
    const r = mapColumns(["house_number", "street_name", "city", "st", "zip5"]);
    expect(r.ok && r.map.index).toEqual({ houseNumber: 0, street: 1, city: 2, state: 3, zip: 4 });
  });
  it("knows the headers voter and supporter files use for a home address", () => {
    const r = mapColumns(["VANID", "Home Address", "Home City", "Home State", "Home Zip"]);
    expect(r.ok && r.map.index).toEqual({ line1: 1, city: 2, state: 3, zip: 4 });
  });
  it("treats a lone street column as the whole first line", () => {
    const r = mapColumns(["street", "city", "state", "zip"]);
    expect(r.ok && r.map.index).toEqual({ line1: 0, city: 1, state: 2, zip: 3 });
  });
  it("keeps a house number column as data when a full address column exists", () => {
    const r = mapColumns(["address", "house number", "city", "state", "zip"]);
    expect(r.ok && r.map.index.houseNumber).toBeUndefined();
    expect(r.ok && r.map.stored.map((c) => c.name)).toEqual(["house number"]);
  });
  it("needs both halves of a point; a lone latitude is kept as data", () => {
    const r = mapColumns(["address", "city", "state", "zip", "latitude"]);
    expect(r.ok && r.map.index.lat).toBeUndefined();
    expect(r.ok && r.map.stored.map((c) => c.name)).toEqual(["latitude"]);
  });
  it("names the missing columns", () => {
    const r = mapColumns(["name", "address", "party"]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("city, state or ZIP code");
  });
});

describe("never-stored headers (word-based, so an ID column can't hide behind an abbreviation)", () => {
  const dropped = ["SSN", "SSN4", "Last4SSN", "ssn_last_4", "SS#", "Soc Sec", "Social", "Social Security #", "D.O.B", "DOB", "Birthdate", "Born", "Date Of Birth", "DateOfBirth", "Birth Year", "License No", "License #", "Lic Num", "DL", "DL#", "Drivers Lic No", "Driver License", "Govt ID", "ID Number", "Passport", "Tax ID", "TIN", "EIN", "ITIN", "Credit Card", "Card #", "CC Number", "CVV", "Account", "Acct #", "Account Number", "IBAN", "Routing", "Password", "Pwd", "PIN", "Token", "Secret"];
  const kept = ["Business Name", "Class Name", "Voter ID", "VANID", "First Name", "Last Name", "Party", "Phone", "Email", "2024 General", "Precinct", "Registered Date", "Notes", "Age", "Gender", "Race", "Employer", "Licensed Voter Since", "Pinned", "Tinder Group", "Accountant", "Birthplace Note"];
  it("drops every government ID, birth date, payment and password header in the list", () => {
    for (const h of dropped) expect(isNeverStored(h), h).toBe(true);
  });
  it("keeps ordinary columns, including words that merely contain an abbreviation", () => {
    for (const h of kept) expect(isNeverStored(h), h).toBe(false);
  });
});

describe("values that look like a Social Security or card number", () => {
  it("are left out of a free-text column, and counted, while the rest of the row is kept", () => {
    const r = buildSourceData([["Notes", "SSN is 123-45-6789 call after 5"], ["Memo", "card 4111 1111 1111 1111"], ["Phone", "555-0100"], ["Party", "DEM"]]);
    expect(r.data).toEqual({ Phone: "555-0100", Party: "DEM" });
    expect(r.leftOut).toBe(2);
  });
  it("don't catch an ordinary phone number, ZIP+4, date or long ID that fails the card check", () => {
    for (const v of ["(303) 555-0100", "+1 303 555 0100", "80202-1234", "2026-11-18", "1234567890123", "Unit 12-34-5678"]) expect(looksLikeGovIdOrCard(v), v).toBe(false);
    expect(looksLikeGovIdOrCard("123 45 6789")).toBe(true);
    expect(looksLikeGovIdOrCard("5500005555555559")).toBe(true);
  });
});

describe("a half of an emoji can never reach the database", () => {
  it("cuts values and headers by whole characters, never through the middle of one", () => {
    const longValue = `${"a".repeat(499)}😀tail`;
    const { data } = buildSourceData([["Note", longValue]]);
    expect(data!.Note).toBe(`${"a".repeat(499)}😀`);
    expect(() => JSON.parse(JSON.stringify(data))).not.toThrow();
    const r = readAddressFile(`address,city,state,zip,${"h".repeat(98)}😀😀\n1 Oak St,X,IL,62701,1\n`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Every string that will be stored round-trips through JSON and UTF-8 intact.
    for (const t of [...r.file.storedColumns, ...r.file.dropped]) expect(JSON.parse(JSON.stringify(t))).toBe(t);
    expect(r.file.storedColumns[0].endsWith("😀")).toBe(true);
  });
  it("strips a lone surrogate that was already in the file", () => {
    const { data } = buildSourceData([["Note", "ok\ud83dend"]]);
    expect(data!.Note).toBe("okend");
    const r = readAddressFile("address,city,state,zip,Note\n1 Oak\ud83d St,Den\udc00ver,CO,80202,x\n");
    expect(r.ok && r.file.rows[0].line1).toBe("1 Oak St");
    expect(r.ok && r.file.rows[0].city).toBe("Denver");
  });
});

describe("buildSourceData", () => {
  it("keeps header to value, trims and cuts values, and leaves empty ones out", () => {
    const { data, cut } = buildSourceData([["Name", "  Ada   Lovelace "], ["Phone", ""], ["Notes", "x".repeat(900)], ["Party", "DEM"]]);
    expect(Object.keys(data!)).toEqual(["Name", "Notes", "Party"]);
    expect(data!.Name).toBe("Ada Lovelace");
    expect(data!.Notes).toHaveLength(MAX_VALUE_CHARS);
    expect(cut).toEqual([]);
    expect(buildSourceData([["a", ""], ["b", "  "]]).data).toBeNull();
  });
  it("strips hidden and control characters, which a NUL would turn into a database error", () => {
    const { data } = buildSourceData([["Name", "Ada\u0000 Love\u202elace\u200b"]]);
    expect(data!.Name).toBe("Ada Lovelace");
  });
  it("drops columns from the end until a row fits, and says which", () => {
    const entries = Array.from({ length: 40 }, (_, i) => [`column ${i}`, "v".repeat(500)] as const);
    const { data, cut } = buildSourceData(entries);
    expect(new TextEncoder().encode(JSON.stringify(data)).length).toBeLessThanOrEqual(MAX_SOURCE_DATA_BYTES);
    expect(cut.length).toBeGreaterThan(0);
    expect(cut[0]).toBe("column 39");
    expect(Object.keys(data!)).not.toContain(cut[0]);
  });
});

describe("readAddressFile", () => {
  const head = "name,party,address,unit,city,state,zip,lat,lon";
  it("keeps each row's address, record ID and every other column together, apart from the address", () => {
    const r = readAddressFile(`Voter ID,${head}\nV1,Ada Lovelace,DEM,12 Elm St,,Springfield,il,62701,39.78,-89.65\n`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.rows).toEqual([
      { rowNumber: 2, line1: "12 Elm St", unit: null, city: "Springfield", state: "IL", zip: "62701", lat: 39.78, lng: -89.65, sourceRecordId: "V1", sourceData: { name: "Ada Lovelace", party: "DEM" } },
    ]);
    expect(r.file.recordIdColumn).toBe("Voter ID");
    expect(r.file.storedColumns).toEqual(["name", "party"]);
    expect(r.file.dropped).toEqual([]);
    expect(r.file.withPoint).toBe(1);
    expect(r.file.states).toEqual(["IL"]);
    // The address fields themselves carry no name or party.
    const { line1, unit, city, state, zip, lat, lng } = r.file.rows[0];
    expect(JSON.stringify({ line1, unit, city, state, zip, lat, lng })).not.toMatch(/Ada|DEM/);
  });
  it("leaves government ID, birth date and payment columns out of every row", () => {
    const r = readAddressFile("address,city,state,zip,SSN,DOB,Party\n1 Oak St,Denver,CO,80202,123-45-6789,1980-01-02,DEM\n");
    expect(r.ok && r.file.rows[0].sourceData).toEqual({ Party: "DEM" });
    expect(JSON.stringify(r)).not.toMatch(/123-45|1980/);
    expect(r.ok && r.file.dropped).toEqual(["SSN", "DOB"]);
  });
  it("skips unusable rows and says why, by row number", () => {
    const r = readAddressFile(
      [
        head,
        "a,b,,,Springfield,IL,62701,,",
        "a,b,1 Oak St,,,IL,62701,,",
        "a,b,1 Oak St,,Springfield,Illinois,62701,,",
        "a,b,1 Oak St,,Springfield,IL,6270,,",
        "a,b,1 Oak St,,Springfield,IL,627011,,",
        "a,b,2 Oak St,,Springfield,IL,62701-1234,,",
        "a,b,2 oak st,,Springfield,IL,62701,,",
        "a,b,3 Oak\u202eSt,,Springfield,IL,62701,,",
      ].join("\n")
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.rows.map((x) => x.rowNumber)).toEqual([5, 7]);
    expect(r.file.rows[0].zip).toBe("06270");
    expect(r.file.rows[1].zip).toBe("62701");
    expect(r.file.skipped.map((s) => s.rowNumber)).toEqual([2, 3, 4, 6, 8, 9]);
    expect(r.file.skipped.find((s) => s.rowNumber === 8)?.reason).toMatch(/earlier row/);
    expect(r.file.rowCount).toBe(8);
  });
  it("skips a row whose record ID repeats an earlier one, and keeps a blank ID as no ID", () => {
    const r = readAddressFile("VANID,address,city,state,zip\nV1,1 Oak St,X,IL,62701\nV1,2 Oak St,X,IL,62701\n,3 Oak St,X,IL,62701\n");
    expect(r.ok && r.file.rows.map((x) => x.sourceRecordId)).toEqual(["V1", null]);
    expect(r.ok && r.file.skipped.find((s) => s.rowNumber === 3)?.reason).toMatch(/record ID/);
  });
  it("reads ZIP+4 with or without the hyphen, and a spreadsheet's number", () => {
    const r = readAddressFile(`${head}\na,b,1 Oak St,,X,IL,021381234,,\na,b,2 Oak St,,X,IL,2138.0,,\n`);
    expect(r.ok && r.file.rows.map((x) => x.zip)).toEqual(["02138", "02138"]);
  });
  it("keeps a second address line that isn't a unit as a column of its own, never as the unit a canvasser is sent to", () => {
    const rows = ["Apt 2", "Unit 4B", "#3", "Ste. 100", "2F", "B", "C/O Jane Doe", "Attn: Bob", "Jane Doe", "Apt Smith", "Apt B", "Ste A1"].map((u, i) => `a,b,${i + 1} Oak St,${u},X,IL,62701,,`);
    const r = readAddressFile([head, ...rows].join("\n"));
    expect(r.ok && r.file.rows.map((x) => x.unit)).toEqual(["Apt 2", "Unit 4B", "#3", "Ste. 100", "2F", "B", null, null, null, null, "Apt B", "Ste A1"]);
    expect(r.ok && r.file.unitsLeftOff).toBe(4);
    // The value is in the row's own data, under its header, and nowhere in the address.
    expect(r.ok && r.file.rows[6].sourceData?.unit).toBe("C/O Jane Doe");
    expect(r.ok && r.file.rows[6].line1).toBe("7 Oak St");
  });
  it("records never-stored headers clean and capped", () => {
    const r = readAddressFile(`address,city,state,zip,SSN\u0000x,${"d".repeat(300)} dob,${Array.from({ length: 250 }, (_, i) => `ssn${i}`).join(",")}\n1 Oak St,X,IL,62701\n`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.dropped[0]).toBe("SSNx");
    expect(r.file.dropped[1].length).toBe(100);
    expect(r.file.dropped.length).toBe(201);
    expect(r.file.dropped[200]).toBe("+52 more");
  });
  it("cuts columns that don't fit a row and names them", () => {
    const cols = Array.from({ length: 40 }, (_, i) => `c${i}`);
    const row = cols.map(() => "w".repeat(480));
    const r = readAddressFile(`address,city,state,zip,${cols.join(",")}\n1 Oak St,X,IL,62701,${row.join(",")}\n`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.dropped.length).toBeGreaterThan(0);
    expect(r.file.storedColumns).not.toContain(r.file.dropped[0]);
    expect(new TextEncoder().encode(JSON.stringify(r.file.rows[0].sourceData)).length).toBeLessThanOrEqual(MAX_SOURCE_DATA_BYTES);
  });
  it("refuses a file in which no row has a usable address, naming the first problem", () => {
    const r = readAddressFile(`${head}\na,b,1 Oak St,,X,IL,12,,\n`);
    expect(!r.ok && r.reason).toMatch(/line 2: The ZIP code/);
  });
  it("leaves the point off when it is out of range or half-missing", () => {
    const r = readAddressFile(`${head}\na,b,1 Oak St,,X,IL,62701,91,-89\na,b,2 Oak St,,X,IL,62701,39,\n`);
    expect(r.ok && r.file.rows.map((x) => [x.lat, x.lng])).toEqual([
      [null, null],
      [null, null],
    ]);
  });
  it("refuses a file with no rows, too many rows, or no address columns", () => {
    expect(readAddressFile(head).ok).toBe(false);
    expect(readAddressFile("name,party\nA,B").ok).toBe(false);
    const big = `address,city,state,zip\n${"1 A St,X,IL,62701\n".repeat(MAX_ROWS + 1)}`;
    const r = readAddressFile(big);
    expect(!r.ok && r.reason).toMatch(/more than 10,000 rows/);
  });
});

describe("validateImportMeta", () => {
  const good = { fileName: "list.csv", recordSource: "County voter file, Oct 2026", purpose: "Door canvassing for Measure 3", license: "County public-records license", authorized: "on" };
  it("needs a source, purpose, license and the authorization box", () => {
    expect(validateImportMeta(good).ok).toBe(true);
    const r = validateImportMeta({ fileName: "x.csv" });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["authorized", "license", "purpose", "recordSource"]);
  });
  it("refuses hidden characters in what the uploader states", () => {
    const r = validateImportMeta({ ...good, license: "ok\u0000" });
    expect(!r.ok && r.errors.license).toMatch(/hidden/);
  });
  it("takes a known source system or none, and refuses anything else", () => {
    const ok = validateImportMeta({ ...good, sourceSystem: "ECANVASSER" });
    expect(ok.ok && ok.value.sourceSystem).toBe("ECANVASSER");
    const none = validateImportMeta(good);
    expect(none.ok && none.value.sourceSystem).toBeNull();
    const bad = validateImportMeta({ ...good, sourceSystem: "NGP" });
    expect(!bad.ok && bad.errors.sourceSystem).toBeTruthy();
  });
  it("caps lengths", () => {
    const r = validateImportMeta({ ...good, purpose: "x".repeat(501) });
    expect(!r.ok && r.errors.purpose).toBeTruthy();
  });
});

describe("walking order and cutting", () => {
  const a = (id: string, line1: string, zip = "62701", unit: string | null = null) => ({ id, line1, unit, zip });
  it("splits a house number from its street", () => {
    expect(splitHouseNumber("123 N Main St")).toEqual({ number: 123, street: "N MAIN ST" });
    expect(splitHouseNumber("123A Main St")).toEqual({ number: 123, street: "MAIN ST" });
    expect(splitHouseNumber("12 1/2 Main St")).toEqual({ number: 12, street: "MAIN ST" });
    expect(splitHouseNumber("12-14 Main St")).toEqual({ number: 12, street: "MAIN ST" });
    expect(splitHouseNumber("Rural Route 4")).toEqual({ number: null, street: "RURAL ROUTE 4" });
  });
  it("walks up the odd side and back down the even side, street by street, ZIP by ZIP", () => {
    const order = walkOrder([a("1", "4 Elm St"), a("2", "3 Elm St"), a("3", "2 Elm St"), a("4", "1 Elm St"), a("5", "1 Ash St"), a("6", "Elm St"), a("7", "1 Ash St", "00001"), a("8", "1 Elm St", "62701", "B"), a("9", "1 Elm St", "62701", "A")]);
    expect(order.map((x) => x.id)).toEqual(["7", "5", "4", "9", "8", "2", "1", "3", "6"]);
  });
  it("cuts into numbered books of at most the size asked", () => {
    const stops = ["1 Ash St", "3 Ash St", "1 Elm St", "3 Elm St", "5 Elm St"].map((l, i) => a(String(i), l));
    const books = cutBooks(stops, 2, 4);
    expect(books.map((b) => [b.number, b.stops.length, b.name])).toEqual([
      [4, 2, "Book 4 · Ash St"],
      [5, 2, "Book 5 · Elm St"],
      [6, 1, "Book 6 · Elm St"],
    ]);
    expect(bookName(1, [a("x", "1 Ash St"), a("y", "1 Oak Ave")])).toBe("Book 1 · Ash St to Oak Ave");
    expect(bookName(7, [a("x", `1 ${"Long ".repeat(40)}St`)]).length).toBeLessThanOrEqual(100);
    // An emoji at the cut is kept whole or left out, never split into half a surrogate pair.
    const emoji = bookName(7, [a("x", `1 ${"A".repeat(89)}🏡🏡🏡 St`)]);
    expect(Array.from(emoji).length).toBeLessThanOrEqual(100);
    expect(emoji).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
  it("puts same-number addresses in order", () => {
    expect(walkOrder([a("1", "12B Main St"), a("2", "12A Main St")]).map((x) => x.id)).toEqual(["2", "1"]);
  });
  it("refuses a book size that would never finish", () => {
    expect(() => cutBooks([a("1", "1 A St")], 0, 1)).toThrow();
  });
  it("reads stops per book", () => {
    expect(readStopsPerBook("60")).toEqual({ ok: true, value: 60 });
    for (const bad of ["0", "501", "2.5", "", "x"]) expect(readStopsPerBook(bad).ok).toBe(false);
  });
  it("writes an address on one line", () => {
    expect(addressLine({ line1: "12 Elm St", unit: "Apt 2", city: "Springfield", state: "IL", zip: "62701" })).toBe("12 Elm St, Apt 2, Springfield, IL 62701");
  });
});

describe("final review: headers", () => {
  it("run-together birth and licence headers from county files are never stored; a mobile column is", () => {
    for (const h of ["YOB", "BIRTHDT", "BIRTHYR", "DLNUMBER", "Birth Month"]) expect(isNeverStored(h), h).toBe(true);
    for (const h of ["Mob", "Mobile", "Precinct", "Addl Notes", "AddlNumber"]) expect(isNeverStored(h), h).toBe(false);
  });
  it("refuses a file with more than 500 columns", () => {
    const r = readAddressFile(`${",".repeat(600)}\n${",".repeat(600)}\n`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/columns/);
  });
});
