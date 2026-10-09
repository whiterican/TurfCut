import { describe, expect, it } from "vitest";
import { withoutPastDates, availabilityFromRow, availabilitySummary, EMPTY_AVAILABILITY, isEmptyAvailability, orgAvailabilityView, sameAvailability, timeText, validateAvailability } from "./availability";

const ok = (raw: unknown) => {
  const v = validateAvailability(raw);
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  return v.value;
};

describe("validateAvailability", () => {
  it("accepts a usual week, exceptions and a note, sorted and trimmed", () => {
    const v = ok({
      weekly: { sat: [{ from: "13:00", to: "17:00" }, { from: "09:00", to: "12:00" }], mon: [] },
      exceptions: [{ date: "2026-10-18", ranges: [{ from: "00:00", to: "24:00" }] }, { date: "2026-10-12", ranges: [] }],
      note: "  Weekends best.  ",
    });
    expect(v.weekly).toEqual({ sat: [{ from: "09:00", to: "12:00" }, { from: "13:00", to: "17:00" }] });
    expect(v.exceptions.map((e) => e.date)).toEqual(["2026-10-12", "2026-10-18"]);
    expect(v.note).toBe("Weekends best.");
  });

  it("refuses more than two ranges, overlaps, backwards or malformed times, and unknown days", () => {
    const bad = [
      { weekly: { sat: [{ from: "09:00", to: "10:00" }, { from: "11:00", to: "12:00" }, { from: "13:00", to: "14:00" }] }, exceptions: [] },
      { weekly: { sat: [{ from: "09:00", to: "12:00" }, { from: "11:00", to: "14:00" }] }, exceptions: [] },
      { weekly: { sat: [{ from: "15:00", to: "09:00" }] }, exceptions: [] },
      { weekly: { sat: [{ from: "9:00", to: "15:00" }] }, exceptions: [] },
      { weekly: { sat: [{ from: "24:00", to: "24:00" }] }, exceptions: [] },
      { weekly: { sat: [{ from: "09:00", to: "15:00", extra: 1 }] }, exceptions: [] },
      { weekly: { funday: [] }, exceptions: [] },
      { weekly: [], exceptions: [] },
    ];
    for (const raw of bad) expect({ raw, ok: validateAvailability(raw).ok }).toEqual({ raw, ok: false });
  });

  it("refuses bad, duplicate or too many dates, and a hidden-character or overlong note", () => {
    const bad = [
      { weekly: {}, exceptions: [{ date: "2026-02-30", ranges: [] }] },
      { weekly: {}, exceptions: [{ date: "2026-10-12", ranges: [] }, { date: "2026-10-12", ranges: [] }] },
      { weekly: {}, exceptions: Array.from({ length: 41 }, (_, i) => ({ date: `2027-01-${String((i % 28) + 1).padStart(2, "0")}`, ranges: [] })) },
      { weekly: {}, exceptions: "none" },
      { weekly: {}, exceptions: [], note: "x".repeat(501) },
      { weekly: {}, exceptions: [], note: "call me\u202e" },
      { weekly: {}, exceptions: [], note: 5 },
    ];
    for (const raw of bad) expect(validateAvailability(raw).ok).toBe(false);
  });

  it("allows a blank note and an empty week", () => {
    expect(ok({ weekly: {}, exceptions: [], note: "   " })).toEqual(EMPTY_AVAILABILITY);
    expect(isEmptyAvailability(ok({ weekly: {}, exceptions: [] }))).toBe(true);
  });
});

describe("summary an organization sees", () => {
  it("groups days with the same times and lists upcoming dates only", () => {
    const a = ok({
      weekly: { mon: [{ from: "18:00", to: "21:00" }], wed: [{ from: "18:00", to: "21:00" }], sat: [{ from: "09:00", to: "15:30" }], sun: [{ from: "00:00", to: "24:00" }] },
      exceptions: [{ date: "2026-10-01", ranges: [] }, { date: "2026-10-12", ranges: [] }, { date: "2026-10-18", ranges: [{ from: "12:00", to: "17:00" }] }],
      note: "No Sundays in November.",
    });
    expect(availabilitySummary(a, "2026-10-06")).toEqual({
      usual: "Usually free Mon, Wed 6pm–9pm; Sat 9am–3:30pm; Sun all day.",
      dates: ["Mon, Oct 12: not available", "Sun, Oct 18: free noon–5pm"],
      note: "No Sundays in November.",
    });
  });
  it("says nothing usual when no day is set", () => {
    expect(availabilitySummary(EMPTY_AVAILABILITY, "2026-10-06")).toEqual({ usual: null, dates: [], note: null });
  });
  it("reads times the way people say them", () => {
    expect(["00:00", "09:00", "09:30", "12:00", "12:15", "18:45", "24:00"].map(timeText)).toEqual(["midnight", "9am", "9:30am", "noon", "12:15pm", "6:45pm", "midnight"]);
  });
  it("is withheld when not shared, and none (not a blank) when nothing is set", () => {
    const a = ok({ weekly: { sat: [{ from: "09:00", to: "15:00" }] }, exceptions: [] });
    expect(orgAvailabilityView(a, false, "2026-10-06")).toBe("withheld");
    expect(orgAvailabilityView(EMPTY_AVAILABILITY, false, "2026-10-06")).toBe("withheld");
    expect(orgAvailabilityView(EMPTY_AVAILABILITY, true, "2026-10-06")).toBeNull();
    expect(orgAvailabilityView(a, true, "2026-10-06")).toEqual(availabilitySummary(a, "2026-10-06"));
  });
});

describe("rows", () => {
  it("round-trips, compares regardless of order, and reads a malformed row as empty", () => {
    const a = ok({ weekly: { sat: [{ from: "09:00", to: "15:00" }] }, exceptions: [{ date: "2026-10-12", ranges: [] }], note: "hi" });
    expect(availabilityFromRow({ weekly: a.weekly, exceptions: a.exceptions, note: a.note })).toEqual(a);
    expect(sameAvailability(a, { ...a, weekly: { ...a.weekly, mon: [] } })).toBe(true);
    expect(sameAvailability(a, { ...a, note: null })).toBe(false);
    expect(availabilityFromRow({ weekly: "junk", exceptions: [], note: null })).toEqual(EMPTY_AVAILABILITY);
  });
});

describe("C2.4 review fixes", () => {
  it("joins back-to-back times and reads runs of days as Mon–Fri", () => {
    const a = ok({ weekly: { mon: [{ from: "09:00", to: "12:00" }, { from: "12:00", to: "17:00" }], tue: [{ from: "09:00", to: "17:00" }], wed: [{ from: "09:00", to: "17:00" }], thu: [{ from: "09:00", to: "17:00" }], fri: [{ from: "09:00", to: "17:00" }], sun: [{ from: "09:00", to: "17:00" }] }, exceptions: [] });
    expect(a.weekly.mon).toEqual([{ from: "09:00", to: "17:00" }]);
    expect(availabilitySummary(a, "2026-10-06").usual).toBe("Usually free Mon–Fri, Sun 9am–5pm.");
  });
  it("still shows yesterday's (UTC) date, for US evenings", () => {
    const a = ok({ weekly: {}, exceptions: [{ date: "2026-10-12", ranges: [] }] });
    expect(availabilitySummary(a, "2026-10-13").dates).toEqual(["Mon, Oct 12: not available"]);
    expect(availabilitySummary(a, "2026-10-14").dates).toEqual([]);
  });
  it("says what's wrong, per day and per date", () => {
    const v = validateAvailability({ weekly: { mon: [{ from: "", to: "17:00" }] }, exceptions: [{ date: "", ranges: [] }, { date: "2026-10-12", ranges: [] }, { date: "2026-10-12", ranges: [] }] });
    expect(!v.ok && v.errors).toEqual({ mon: "Monday: Fill in both times.", "exceptions.0": "Pick a date.", "exceptions.2": "Mon, Oct 12, 2026 is listed twice." });
    const shape = validateAvailability({ weekly: {}, exceptions: "nope" });
    expect(!shape.ok && shape.errors.exceptions).toMatch(/Reload/);
  });
  it("drops dates that are over, keeping yesterday", () => {
    const a = ok({ weekly: {}, exceptions: [{ date: "2026-10-04", ranges: [] }, { date: "2026-10-05", ranges: [] }, { date: "2026-10-09", ranges: [] }] });
    expect(withoutPastDates(a, "2026-10-06").exceptions.map((e) => e.date)).toEqual(["2026-10-05", "2026-10-09"]);
  });
  it("a date's error points at the row the worker sees, past dates included", () => {
    const v = validateAvailability({ weekly: {}, exceptions: [{ date: "2026-10-01", ranges: [] }, { date: "", ranges: [] }] });
    expect(!v.ok && v.errors).toEqual({ "exceptions.1": "Pick a date." });
  });
  it("refuses tag characters and line separators in the note", () => {
    for (const note of ["a\u{e0041}b", "a\u2028b", "a\u00adb"]) expect(validateAvailability({ weekly: {}, exceptions: [], note }).ok).toBe(false);
  });
});
