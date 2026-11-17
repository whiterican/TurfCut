import { describe, expect, it } from "vitest";
import {
  addressLine,
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
    expect(r).toEqual({ ok: true, rows: [["a", "b", "c"], ["1, Elm", 'say "hi"', "two\nlines"], ["x", "", "z"]] });
  });
  it("refuses an unterminated quote", () => {
    expect(parseCsv('a,b\n"open,1').ok).toBe(false);
  });
  it("keeps a trailing empty field", () => {
    expect(parseCsv("a,b,\n")).toEqual({ ok: true, rows: [["a", "b", ""]] });
  });
});

describe("mapColumns", () => {
  it("finds the address columns and drops everything else by name", () => {
    const r = mapColumns(["Voter ID", "First Name", "Party", "Residence Address", "Apt", "City", "State", "Zip Code", "2024 General", "Phone"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.map.index).toEqual({ line1: 3, unit: 4, city: 5, state: 6, zip: 7 });
    expect(r.map.dropped).toEqual(["Voter ID", "First Name", "Party", "2024 General", "Phone"]);
  });
  it("joins a house number and street name when there is no full address column", () => {
    const r = mapColumns(["house_number", "street_name", "city", "st", "zip5"]);
    expect(r.ok && r.map.index).toEqual({ houseNumber: 0, street: 1, city: 2, state: 3, zip: 4 });
  });
  it("treats a lone street column as the whole first line", () => {
    const r = mapColumns(["street", "city", "state", "zip"]);
    expect(r.ok && r.map.index).toEqual({ line1: 0, city: 1, state: 2, zip: 3 });
  });
  it("drops a house number column when a full address column exists", () => {
    const r = mapColumns(["address", "house number", "city", "state", "zip"]);
    expect(r.ok && r.map.index.houseNumber).toBeUndefined();
    expect(r.ok && r.map.dropped).toEqual(["house number"]);
  });
  it("needs both halves of a point", () => {
    const r = mapColumns(["address", "city", "state", "zip", "latitude"]);
    expect(r.ok && r.map.index.lat).toBeUndefined();
    expect(r.ok && r.map.dropped).toEqual(["latitude"]);
  });
  it("names the missing columns", () => {
    const r = mapColumns(["name", "address", "party"]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("city, state or ZIP code");
  });
});

describe("readAddressFile", () => {
  const head = "name,party,address,unit,city,state,zip,lat,lon";
  it("keeps addresses only: no name, party or other column reaches a row", () => {
    const r = readAddressFile(`${head}\nAda Lovelace,DEM,12 Elm St,,Springfield,il,62701,39.78,-89.65\n`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.rows).toEqual([{ rowNumber: 1, line1: "12 Elm St", unit: null, city: "Springfield", state: "IL", zip: "62701", lat: 39.78, lng: -89.65 }]);
    expect(JSON.stringify(r.file.rows)).not.toMatch(/Ada|DEM/);
    expect(r.file.dropped).toEqual(["name", "party"]);
    expect(r.file.withPoint).toBe(1);
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
        "a,b,3 Oak‮St,,Springfield,IL,62701,,",
      ].join("\n")
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.rows.map((x) => x.rowNumber)).toEqual([4, 6]);
    expect(r.file.rows[0].zip).toBe("06270");
    expect(r.file.rows[1].zip).toBe("62701");
    expect(r.file.skipped.map((s) => s.rowNumber)).toEqual([1, 2, 3, 5, 7, 8]);
    expect(r.file.skipped.find((s) => s.rowNumber === 7)?.reason).toMatch(/earlier row/);
    expect(r.file.rowCount).toBe(8);
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
  });
  it("reads stops per book", () => {
    expect(readStopsPerBook("60")).toEqual({ ok: true, value: 60 });
    for (const bad of ["0", "501", "2.5", "", "x"]) expect(readStopsPerBook(bad).ok).toBe(false);
  });
  it("writes an address on one line", () => {
    expect(addressLine({ line1: "12 Elm St", unit: "Apt 2", city: "Springfield", state: "IL", zip: "62701" })).toBe("12 Elm St, Apt 2, Springfield, IL 62701");
  });
});
