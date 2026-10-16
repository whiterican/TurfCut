import { describe, expect, it } from "vitest";
import { claimCheck, headcountCheck, seatsLeft, slotFit, slotState, sortForWorker, validateSlot, type SlotFacts } from "@/lib/shift-slots";
import type { Availability } from "@/lib/availability";

const job = { startsAt: null, endsAt: null };
const base = { startsAt: "2026-11-02T14:00:00Z", endsAt: "2026-11-02T20:00:00Z", headcount: "6" };

describe("validateSlot", () => {
  it("accepts a slot with seats and notes", () => {
    const v = validateSlot({ ...base, notes: "  Bring water  " }, job);
    expect(v.ok && v.value.headcount).toBe(6);
    expect(v.ok && v.value.notes).toBe("Bring water");
  });
  it("rejects bad headcounts", () => {
    for (const headcount of ["0", "-1", "2.5", "abc", "", "201"]) {
      const v = validateSlot({ ...base, headcount }, job);
      expect(!v.ok && v.errors.headcount).toBeTruthy();
    }
  });
  it("keeps shift-field errors alongside its own", () => {
    const v = validateSlot({ ...base, endsAt: base.startsAt, headcount: "0" }, job);
    expect(!v.ok && Object.keys(v.errors).sort()).toEqual(["endsAt", "headcount"]);
  });
  it("caps notes", () => {
    const v = validateSlot({ ...base, notes: "x".repeat(501) }, job);
    expect(!v.ok && v.errors.notes).toBeTruthy();
    const h = validateSlot({ ...base, notes: "meet\u202Ehere" }, job);
    expect(!h.ok && h.errors.notes).toBeTruthy();
  });
});

const now = new Date("2026-11-01T12:00:00Z");
const slot = (o: Partial<SlotFacts> = {}): SlotFacts => ({ status: "OPEN", startsAt: new Date(base.startsAt), endsAt: new Date(base.endsAt), headcount: 2, taken: 0, ...o });

describe("claims", () => {
  it("opens, fills and closes", () => {
    expect(slotState(slot(), now)).toBe("open");
    expect(slotState(slot({ taken: 2 }), now)).toBe("full");
    expect(slotState(slot({ taken: 5 }), now)).toBe("full");
    expect(seatsLeft(slot({ taken: 5 }))).toBe(0);
    expect(slotState(slot({ status: "CLOSED" }), now)).toBe("closed");
    expect(slotState(slot(), new Date(base.startsAt))).toBe("started");
    expect(slotState(slot({ status: "CLOSED" }), new Date(base.endsAt))).toBe("ended");
  });
  it("checks each refusal", () => {
    expect(claimCheck(slot(), false, now)).toEqual({ ok: true });
    expect(claimCheck(slot(), true, now).ok).toBe(false);
    expect(claimCheck(slot({ taken: 2 }), false, now).ok).toBe(false);
    expect(claimCheck(slot({ status: "CLOSED" }), false, now).ok).toBe(false);
    expect(claimCheck(slot(), false, new Date(base.endsAt)).ok).toBe(false);
  });
  it("won't shrink seats below the sign-ups", () => {
    expect(headcountCheck(3, 3)).toBeNull();
    expect(headcountCheck(2, 3)).toMatch(/3 people/);
  });
});

describe("slotFit", () => {
  const tz = "America/New_York"; // Nov 2 2026 is EST (UTC-5): 14:00Z = 9am Monday
  const a = (o: Partial<Availability>): Availability => ({ weekly: {}, exceptions: [], note: null, ...o });
  const s = { startsAt: new Date(base.startsAt), endsAt: new Date(base.endsAt) }; // 9am–3pm Mon
  it("fits, partly, outside, unknown", () => {
    expect(slotFit(s, a({ weekly: { mon: [{ from: "08:00", to: "17:00" }] } }), tz)).toBe("fits");
    expect(slotFit(s, a({ weekly: { mon: [{ from: "08:00", to: "12:00" }, { from: "12:00", to: "16:00" }] } }), tz)).toBe("fits");
    expect(slotFit(s, a({ weekly: { mon: [{ from: "12:00", to: "17:00" }] } }), tz)).toBe("partly");
    expect(slotFit(s, a({ weekly: { tue: [{ from: "00:00", to: "24:00" }] } }), tz)).toBe("outside");
    expect(slotFit(s, a({}), tz)).toBe("unknown");
  });
  it("a date exception overrides the usual week", () => {
    const w = { mon: [{ from: "00:00", to: "24:00" }] };
    expect(slotFit(s, a({ weekly: w, exceptions: [{ date: "2026-11-02", ranges: [] }] }), tz)).toBe("outside");
    expect(slotFit(s, a({ exceptions: [{ date: "2026-11-02", ranges: [{ from: "09:00", to: "15:00" }] }] }), tz)).toBe("fits");
  });
  it("handles clocks falling back and springing forward", () => {
    // Nov 1 2026: 05:30Z = 01:30 EDT, 06:10Z = 01:10 EST (40 minutes later).
    const back = { startsAt: new Date("2026-11-01T05:30:00Z"), endsAt: new Date("2026-11-01T06:10:00Z") };
    expect(slotFit(back, a({ weekly: { tue: [{ from: "09:00", to: "10:00" }] } }), tz)).toBe("outside");
    expect(slotFit(back, a({ weekly: { sun: [{ from: "01:00", to: "03:00" }] } }), tz)).toBe("fits");
    // Mar 8 2026: 06:30Z = 01:30 EST, 07:30Z = 03:30 EDT.
    const fwd = { startsAt: new Date("2026-03-08T06:30:00Z"), endsAt: new Date("2026-03-08T07:30:00Z") };
    expect(slotFit(fwd, a({ weekly: { sun: [{ from: "01:00", to: "04:00" }] } }), tz)).toBe("fits");
  });
  it("ends at local midnight, and copes with a bad time zone", () => {
    const eve = { startsAt: new Date("2026-11-03T01:00:00Z"), endsAt: new Date("2026-11-03T05:00:00Z") }; // Mon 8pm – midnight
    expect(slotFit(eve, a({ weekly: { mon: [{ from: "20:00", to: "24:00" }] } }), tz)).toBe("fits");
    expect(slotFit(eve, a({ weekly: { mon: [{ from: "20:00", to: "24:00" }] } }), "Not/AZone")).toBe("unknown");
  });
  it("empty days and only past dates read as unknown", () => {
    expect(slotFit(s, a({ weekly: { mon: [] } }), tz)).toBe("unknown");
    expect(slotFit(s, a({ exceptions: [{ date: "2026-10-01", ranges: [] }] }), tz, "2026-11-01")).toBe("unknown");
  });
  it("splits a slot across midnight", () => {
    const late = { startsAt: new Date("2026-11-03T03:00:00Z"), endsAt: new Date("2026-11-03T06:00:00Z") }; // Mon 10pm – Tue 1am
    expect(slotFit(late, a({ weekly: { mon: [{ from: "20:00", to: "24:00" }], tue: [{ from: "00:00", to: "02:00" }] } }), tz)).toBe("fits");
    expect(slotFit(late, a({ weekly: { mon: [{ from: "20:00", to: "24:00" }] } }), tz)).toBe("partly");
  });
  it("sorts fits first, then by start", () => {
    const d = (h: number) => new Date(Date.UTC(2026, 10, 2, h));
    const out = sortForWorker([
      { id: "a", startsAt: d(9), fit: "outside" as const, state: "open" as const },
      { id: "b", startsAt: d(12), fit: "fits" as const, state: "open" as const },
      { id: "c", startsAt: d(8), fit: "unknown" as const, state: "open" as const },
      { id: "d", startsAt: d(10), fit: "fits" as const, state: "open" as const },
      { id: "e", startsAt: d(7), fit: "fits" as const, state: "full" as const },
    ]);
    expect(out.map((x) => x.id)).toEqual(["d", "b", "c", "a", "e"]);
  });
});
