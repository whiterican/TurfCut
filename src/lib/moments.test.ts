import { describe, expect, it } from "vitest";
import { countAt, easeOut, morphsToPaid, pillState, ringFill, shiftFill } from "./moments";

describe("field-worker moments (P1.4)", () => {
  it("counts up in whole steps from the old value to the new, never past it", () => {
    expect(countAt(12, 17, 0)).toBe(12);
    expect(countAt(12, 17, 1)).toBe(17);
    for (let t = 0; t <= 1; t += 0.05) {
      const v = countAt(12, 17, t);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(12);
      expect(v).toBeLessThanOrEqual(17);
    }
    // A correction downward counts down, and still lands exactly.
    expect(countAt(17, 12, 0.5)).toBeGreaterThanOrEqual(12);
    expect(countAt(17, 12, 1)).toBe(12);
    expect(countAt(NaN, 5, 0.3)).toBe(5);
    expect(easeOut(2)).toBe(1);
  });

  it("keeps rings between empty and full", () => {
    expect(ringFill(null)).toBe(0);
    expect(ringFill(1.4)).toBe(1);
    expect(ringFill(-1)).toBe(0);
    expect(ringFill(0.42)).toBe(0.42);
    expect(shiftFill(90 * 60_000, 4 * 3_600_000)).toBeCloseTo(0.375);
    expect(shiftFill(1, 0)).toBe(0);
  });

  it("puts the most urgent connection state on the pill", () => {
    const base = { online: true, reachable: true, syncing: false, waiting: 0, refused: 0 };
    expect(pillState(base)).toBe("online");
    expect(pillState({ ...base, waiting: 2 })).toBe("waiting");
    expect(pillState({ ...base, waiting: 2, syncing: true })).toBe("syncing");
    expect(pillState({ ...base, waiting: 2, online: false })).toBe("offline");
    expect(pillState({ ...base, reachable: false })).toBe("offline");
    expect(pillState({ ...base, online: false, refused: 1 })).toBe("refused");
  });

  it("morphs a pay line to paid only when this phone saw it on its way", () => {
    expect(morphsToPaid("PROCESSING", "PAID")).toBe(true);
    expect(morphsToPaid("APPROVED", "PAID")).toBe(true);
    expect(morphsToPaid(null, "PAID")).toBe(false); // first look: just paid, no replay
    expect(morphsToPaid("PAID", "PAID")).toBe(false);
    expect(morphsToPaid("HELD", "PAID")).toBe(false);
    expect(morphsToPaid("PROCESSING", "HELD")).toBe(false);
  });
});
