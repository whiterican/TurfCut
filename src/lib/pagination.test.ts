import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, page, parseLimit } from "./pagination";

describe("parseLimit", () => {
  it("defaults, clamps and floors", () => {
    expect(parseLimit(null)).toBe(100);
    expect(parseLimit("")).toBe(100);
    expect(parseLimit("abc")).toBe(100);
    expect(parseLimit("0")).toBe(1);
    expect(parseLimit("-5")).toBe(1);
    expect(parseLimit("12.9")).toBe(12);
    expect(parseLimit("9999")).toBe(200);
  });
});

describe("cursors", () => {
  it("round-trip", () => {
    const c = { at: new Date("2026-10-26T12:00:00Z"), id: "abc" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });
  it("missing is undefined, junk is null", () => {
    expect(decodeCursor(undefined)).toBeUndefined();
    expect(decodeCursor("%%%")).toBeNull();
    expect(decodeCursor(Buffer.from('["nope","x"]').toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from('{"a":1}').toString("base64url"))).toBeNull();
  });
});

describe("page", () => {
  const rows = [1, 2, 3].map((i) => ({ id: `r${i}`, at: new Date(2026, 0, i) }));
  it("no next page when everything fits", () => {
    expect(page(rows, 3, (r) => r.at)).toEqual({ items: rows, nextCursor: null });
  });
  it("a cursor after the last item when there is more", () => {
    const p = page(rows, 2, (r) => r.at);
    expect(p.items).toEqual(rows.slice(0, 2));
    expect(decodeCursor(p.nextCursor)).toEqual({ at: rows[1].at, id: "r2" });
  });
});
