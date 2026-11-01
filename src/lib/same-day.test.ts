import { describe, expect, it } from "vitest";
import { sameDay } from "./same-day";

describe("sameDay", () => {
  it("is true for two times on one day in the zone", () => {
    expect(sameDay("2026-10-30T17:30:00Z", "2026-10-30T22:30:00Z", "America/Denver")).toBe(true);
  });
  it("is false when the end falls on the next day in the zone", () => {
    expect(sameDay("2026-10-30T17:30:00Z", "2026-10-31T20:00:00Z", "America/Denver")).toBe(false);
  });
  it("follows the zone, not UTC", () => {
    // 23:30 and 04:30 UTC the next day are the same evening in Denver.
    expect(sameDay("2026-10-30T23:30:00Z", "2026-10-31T04:30:00Z", "America/Denver")).toBe(true);
    expect(sameDay("2026-10-30T23:30:00Z", "2026-10-31T04:30:00Z", "UTC")).toBe(false);
  });
  it("holds across a DST change", () => {
    // Denver leaves daylight time at 08:00 UTC on 2026-11-01.
    expect(sameDay("2026-11-01T06:30:00Z", "2026-11-01T18:00:00Z", "America/Denver")).toBe(true);
  });
});
