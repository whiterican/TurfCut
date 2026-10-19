import { describe, expect, it } from "vitest";
import { parsePeriod, periodBounds, periodClosed, periodLabel, periodOf, periodsBetween, receiptNumber, statementNumber } from "@/lib/money-views";

describe("receipts and statement periods", () => {
  it("numbers receipts and statements", () => {
    expect(receiptNumber(1)).toBe("R-000001");
    expect(receiptNumber(1234567)).toBe("R-1234567");
    expect(statementNumber("2026-10")).toBe("S-2026-10");
  });
  it("reads and bounds a period in UTC", () => {
    expect(parsePeriod("2026-10")).toBe("2026-10");
    expect(parsePeriod("2026-13")).toBeNull();
    expect(parsePeriod("2026-1")).toBeNull();
    expect(periodOf(new Date("2026-10-31T23:59:59Z"))).toBe("2026-10");
    expect(periodOf(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11");
    const b = periodBounds("2026-12");
    expect(b.start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(b.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(periodLabel("2026-10")).toBe("October 2026");
  });
  it("knows when a month is over", () => {
    expect(periodClosed("2026-10", new Date("2026-10-31T23:00:00Z"))).toBe(false);
    expect(periodClosed("2026-10", new Date("2026-11-01T00:00:00Z"))).toBe(true);
  });
  it("lists months newest first, across a year end", () => {
    expect(periodsBetween(new Date("2025-11-15T00:00:00Z"), new Date("2026-02-03T00:00:00Z"))).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
    expect(periodsBetween(new Date("2026-10-05T00:00:00Z"), new Date("2026-10-20T00:00:00Z"))).toEqual(["2026-10"]);
  });
});
