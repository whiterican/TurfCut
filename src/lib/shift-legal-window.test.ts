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

describe("time-zone boundary and DST regression cases", () => {
  const allDays = { ...policy, allowedWeekdays: [0, 1, 2, 3, 4, 5, 6] };
  it("allows an end exactly at closing time but rejects one minute afterward", () => {
    const closesExactly = context("2026-10-26T22:00:00Z", "2026-10-27T00:00:00Z"); // 18:00–20:00 EDT
    expect(checkApprovedShiftWindow(closesExactly, allDays, now).allowedByConfiguredWindow).toBe(true);
    expect(checkApprovedShiftWindow(context("2026-10-26T22:00:00Z", "2026-10-27T00:01:00Z"), allDays, now).allowedByConfiguredWindow).toBe(false);
  });
  it("uses the work-location timezone instead of the server's UTC clock", () => {
    const eastern = context("2026-10-26T12:59:00Z", "2026-10-26T14:00:00Z"); // 08:59 EDT to 10:00 EDT
    expect(checkApprovedShiftWindow(eastern, allDays, now).allowedByConfiguredWindow).toBe(false);
    expect(checkApprovedShiftWindow(context("2026-10-26T13:00:00Z", "2026-10-26T14:00:00Z"), allDays, now).allowedByConfiguredWindow).toBe(true);
  });
  it("evaluates every real minute across spring DST jump", () => {
    const springPolicy = { ...allDays, localStart: "01:00", localEnd: "04:00" };
    // DST jumps from 01:59 to 03:00 in New York on March 8, 2026.
    expect(checkApprovedShiftWindow(context("2026-03-08T06:30:00Z", "2026-03-08T07:30:00Z"), springPolicy, new Date("2026-03-07T12:00:00Z")).allowedByConfiguredWindow).toBe(true);
  });
  it("evaluates both repetitions of a local hour during fall DST reversal", () => {
    const fallPolicy = { ...allDays, localStart: "01:00", localEnd: "02:00", expiresAt: "2027-01-01T00:00:00Z" };
    // 01:30 occurs twice on November 1, 2026. Both instants must be evaluated.
    expect(checkApprovedShiftWindow(context("2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"), fallPolicy, now).allowedByConfiguredWindow).toBe(true);
    expect(checkApprovedShiftWindow(context("2026-11-01T05:30:00Z", "2026-11-01T07:01:00Z"), fallPolicy, now).allowedByConfiguredWindow).toBe(false);
  });
  it("denies malformed or missing day restrictions without crashing", () => {
    const shift = context("2026-10-26T14:00:00Z", "2026-10-26T18:00:00Z");
    for (const malformed of [
      { ...policy, allowedWeekdays: null },
      { ...policy, allowedWeekdays: [] },
      { ...policy, blockedDates: null },
      { ...policy, blockedDates: ["not-a-date"] },
      { ...policy, blockedDates: ["2026-13-26"] },
    ]) {
      expect(checkApprovedShiftWindow(shift, malformed as unknown as ApprovedShiftWindow, now).allowedByConfiguredWindow).toBe(false);
    }
  });

  it("rejects truthy approval, missing timezone, impossible dates and malformed shifts", () => {
    const shift = context("2026-10-26T14:00:00Z", "2026-10-26T18:00:00Z");
    for (const approved of ["false", 1, {}]) {
      expect(checkApprovedShiftWindow(shift, { ...policy, approved } as unknown as ApprovedShiftWindow, now).allowedByConfiguredWindow).toBe(false);
    }
    for (const timezone of [undefined, "UTC", "EST", "Etc/GMT+5"]) {
      expect(checkApprovedShiftWindow(shift, { ...policy, timezone } as unknown as ApprovedShiftWindow, now).allowedByConfiguredWindow).toBe(false);
    }
    for (const blockedDates of [["2026-02-29"], ["2026-02-30"], ["2026-04-31"]]) {
      expect(checkApprovedShiftWindow(shift, { ...policy, blockedDates }, now).allowedByConfiguredWindow).toBe(false);
    }
    expect(checkApprovedShiftWindow(shift, { ...policy, jurisdiction: "" }, now).allowedByConfiguredWindow).toBe(false);
    expect(checkApprovedShiftWindow({ ...shift, startsAt: "bad" } as unknown as typeof shift, policy, now).allowedByConfiguredWindow).toBe(false);
    expect(checkApprovedShiftWindow(null as unknown as typeof shift, policy, now).allowedByConfiguredWindow).toBe(false);
  });

});

describe("review follow-ups: current IANA names", () => {
  const shift = { startsAt: new Date("2026-10-26T14:00:00Z"), endsAt: new Date("2026-10-26T18:00:00Z"), activity: "door_sales", jurisdiction: "US-MD-example" };
  const rule = { timezone: "America/New_York", allowedWeekdays: [0, 1, 2, 3, 4, 5, 6], localStart: "09:00", localEnd: "20:00", blockedDates: [], approved: true, expiresAt: "2027-01-01T00:00:00Z", activity: "door_sales", jurisdiction: "US-MD-example" } satisfies ApprovedShiftWindow;
  const now = new Date("2026-10-23T12:00:00Z");
  it("accepts current region names the runtime lists under an older spelling", () => {
    for (const tz of ["America/Indiana/Indianapolis", "America/Kentucky/Louisville", "America/New_York"]) {
      expect(checkApprovedShiftWindow(shift, { ...rule, timezone: tz }, now).allowedByConfiguredWindow, tz).toBe(true);
    }
  });
  it("still rejects unknown zones, offsets, abbreviations and Etc/ zones", () => {
    for (const tz of ["Bad/Zone", "UTC", "EST", "+05:00", "Etc/GMT+5"]) {
      expect(checkApprovedShiftWindow(shift, { ...rule, timezone: tz }, now).allowedByConfiguredWindow, tz).toBe(false);
    }
  });
});

it("rejects Etc/ zones in any letter case", () => {
  const shift = { startsAt: new Date("2026-10-26T14:00:00Z"), endsAt: new Date("2026-10-26T18:00:00Z"), activity: "door_sales", jurisdiction: "X" };
  const rule = { timezone: "etc/utc", allowedWeekdays: [0, 1, 2, 3, 4, 5, 6], localStart: "09:00", localEnd: "20:00", approved: true, expiresAt: "2027-01-01T00:00:00Z", activity: "door_sales", jurisdiction: "X" };
  for (const tz of ["etc/utc", "eTc/Universal", "etc/Greenwich"]) expect(checkApprovedShiftWindow(shift, { ...rule, timezone: tz }, new Date("2026-10-23T12:00:00Z")).allowedByConfiguredWindow, tz).toBe(false);
});
