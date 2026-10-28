import { describe, expect, it } from "vitest";
import { laterShifts, pickHero } from "./home-hero";

const s = (id: string) => ({ id });

describe("Home's hero (P0 state truth)", () => {
  it("puts a shift under way first, with an old missing check-out as a separate alert, never instead of it", () => {
    expect(pickHero(s("tue"), s("mon"), s("wed"))).toEqual({ kind: "live", shiftId: "tue", overdueAlert: "mon" });
    expect(pickHero(s("tue"), null, s("wed"))).toEqual({ kind: "live", shiftId: "tue", overdueAlert: null });
  });

  it("shows a missing check-out before the next shift, and the next shift then stays in Coming up", () => {
    const hero = pickHero(null, s("mon"), s("wed"));
    expect(hero).toEqual({ kind: "overdue", shiftId: "mon" });
    expect(laterShifts([s("wed"), s("thu")], hero)).toEqual([s("wed"), s("thu")]);
  });

  it("shows the next shift, and Coming up skips only that one", () => {
    const hero = pickHero(null, null, s("wed"));
    expect(hero).toEqual({ kind: "next", shiftId: "wed" });
    expect(laterShifts([s("wed"), s("thu"), s("fri"), s("sat"), s("sun")], hero)).toEqual([s("thu"), s("fri"), s("sat")]);
  });

  it("has nothing to show without shifts", () => {
    expect(pickHero(null, null, null)).toEqual({ kind: "none" });
    expect(laterShifts([], { kind: "none" })).toEqual([]);
  });
});
