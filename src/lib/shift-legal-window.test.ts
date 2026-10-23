import { describe, expect, it } from "vitest";
import { checkApprovedShiftWindow, type ApprovedShiftWindow } from "./shift-legal-window";

const policy: ApprovedShiftWindow = {
  timezone: "America/New_York", allowedWeekdays: [1, 2, 3, 4, 5, 6],
  localStart: "09:00", localEnd: "20:00", blockedDates: [],
  approved: true, expiresAt: "2027-01-01T00:00:00Z",
  activity: "door_sales", jurisdiction: "US-MD-example",
};
const context = (start: string, end: string) => ({
  startsAt: new Date(start), endsAt: new Date(end),
  activity: "door_sales", jurisdiction: "US-MD-example",
});
const now = new Date("2026-10-23T12:00:00Z");
describe("future counsel-approved shift-hour guard, not wired into live scheduling", () => {
  it("fails closed when rules missing or pending approval", () => {
    expect(checkApprovedShiftWindow(context("2026-10-26T14:00:00Z", "2026-10-26T18:00:00Z"), null, now).allowedByConfiguredWindow).toBe(false);
    expect(checkApprovedShiftWindow(context("2026-10-26T14:00:00Z", "2026-10-26T18:00:00Z"), { ...policy, approved: false }, now).allowedByConfiguredWindow).toBe(false);
  });
  it("accepts an example shift wholly within an approved local window", () => {
    expect(checkApprovedShiftWindow(context("2026-10-26T14:00:00Z", "2026-10-26T18:00:00Z"), policy, now).allowedByConfiguredWindow).toBe(true);
  });
  it("blocks work after local cutoff and on a restricted Sunday", () => {
    expect(checkApprovedShiftWindow(context("2026-10-26T23:30:00Z", "2026-10-27T01:00:00Z"), policy, now).allowedByConfiguredWindow).toBe(false);
    expect(checkApprovedShiftWindow(context("2026-10-25T15:00:00Z", "2026-10-25T17:00:00Z"), policy, now).allowedByConfiguredWindow).toBe(false);
  });
  it("blocks closed dates, invalid timezone, mismatched activity and expired rules", () => {
    const shift = context("2026-10-26T14:00:00Z", "2026-10-26T18:00:00Z");
    for (const rule of [
      { ...policy, blockedDates: ["2026-10-26"] },
      { ...policy, timezone: "Not/AZone" },
      { ...policy, activity: "petition_circulation" },
      { ...policy, expiresAt: "2026-10-26T15:00:00Z" },
    ]) expect(checkApprovedShiftWindow(shift, rule, now).allowedByConfiguredWindow).toBe(false);
  });
  it("blocks invalid or overlong intervals", () => {
    expect(checkApprovedShiftWindow(context("2026-10-26T14:00:00Z", "2026-10-26T14:00:00Z"), policy, now).allowedByConfiguredWindow).toBe(false);
    expect(checkApprovedShiftWindow(context("2026-10-26T14:00:00Z", "2026-10-27T15:00:00Z"), policy, now).allowedByConfiguredWindow).toBe(false);
  });
});
