import { describe, expect, it } from "vitest";
import { shiftPriority } from "./priority";

const now = new Date("2026-10-03T12:00:00Z");
const H = 3_600_000;
const shift = (startInH: number, over: Partial<Parameters<typeof shiftPriority>[0]> = {}) => ({
  startsAt: new Date(now.getTime() + startInH * H),
  endsAt: new Date(now.getTime() + (startInH + 4) * H),
  status: "SCHEDULED",
  checkInAt: null,
  checkOutAt: null,
  ...over,
});

describe("shift priority rings", () => {
  it("3 when on shift or within two hours of check-in", () => {
    expect(shiftPriority(shift(-1, { status: "ACTIVE", checkInAt: new Date(now.getTime() - H) }), now)).toBe(3);
    expect(shiftPriority(shift(2), now)).toBe(3);
    expect(shiftPriority(shift(0.5), now)).toBe(3);
  });
  it("2 when it starts today, 1 when it is further out", () => {
    expect(shiftPriority(shift(5), now)).toBe(2);
    expect(shiftPriority(shift(24), now)).toBe(2);
    expect(shiftPriority(shift(30), now)).toBe(1);
    expect(shiftPriority(shift(24 * 7), now)).toBe(1);
  });
  it("0 once it is done, cancelled, or over", () => {
    expect(shiftPriority(shift(-6, { status: "COMPLETED", checkInAt: new Date(now.getTime() - 6 * H), checkOutAt: new Date(now.getTime() - 2 * H) }), now)).toBe(0);
    expect(shiftPriority(shift(3, { status: "CANCELLED" }), now)).toBe(0);
    expect(shiftPriority(shift(-6), now)).toBe(0);
  });
});
