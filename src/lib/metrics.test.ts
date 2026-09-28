import { describe, expect, it } from "vitest";
import {
  activeHours,
  acceptanceRate,
  contactRate,
  doorsPerActiveHour,
  doorsPerCompletedShift,
  showRate,
  signaturesPerActiveHour,
  type ShiftTotals,
} from "./metrics";

const totals: ShiftTotals = {
  activeMs: 4 * 3_600_000,
  doorsKnocked: 40,
  contacts: 18,
  signaturesSubmitted: 22,
  signaturesAccepted: 20,
  shiftsCompleted: 2,
  shiftsScheduled: 3,
};

describe("scorecard metric formulas", () => {
  it("excludes paused time from active hours", () => {
    const checkIn = new Date("2026-09-28T09:00:00Z");
    const checkOut = new Date("2026-09-28T13:00:00Z");
    expect(activeHours(checkIn, checkOut)).toBe(4);
    expect(
      activeHours(checkIn, checkOut, [
        { start: new Date("2026-09-28T10:00:00Z"), end: new Date("2026-09-28T10:30:00Z") },
      ])
    ).toBe(3.5);
  });

  it("never returns negative active hours", () => {
    const t = new Date("2026-09-28T09:00:00Z");
    expect(activeHours(t, t)).toBe(0);
  });

  it("computes per-hour and per-shift rates", () => {
    expect(doorsPerActiveHour(totals)).toBe(10);
    expect(doorsPerCompletedShift(totals)).toBe(20);
    expect(signaturesPerActiveHour(totals)).toBe(5.5);
  });

  it("computes contact, acceptance, and show rates", () => {
    expect(contactRate(totals)).toBeCloseTo(0.45);
    expect(acceptanceRate(totals)).toBeCloseTo(20 / 22);
    expect(showRate(totals)).toBeCloseTo(2 / 3);
  });

  it("returns null instead of dividing by zero", () => {
    const empty: ShiftTotals = {
      activeMs: 0,
      doorsKnocked: 0,
      contacts: 0,
      signaturesSubmitted: 0,
      signaturesAccepted: 0,
      shiftsCompleted: 0,
      shiftsScheduled: 0,
    };
    expect(doorsPerActiveHour(empty)).toBeNull();
    expect(contactRate(empty)).toBeNull();
    expect(acceptanceRate(empty)).toBeNull();
    expect(showRate(empty)).toBeNull();
    expect(doorsPerCompletedShift(empty)).toBeNull();
  });
});
