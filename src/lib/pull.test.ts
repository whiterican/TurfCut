import { describe, expect, it } from "vitest";
import { PULL_MAX_PX, PULL_START_PX, PULL_THRESHOLD_PX, pullOffset, pullRelease } from "./pull";

describe("pull to refresh (P1.8)", () => {
  it("ignores a wobble, follows the finger with resistance, and never passes the cap", () => {
    expect(pullOffset(0)).toBe(0);
    expect(pullOffset(PULL_START_PX)).toBe(0);
    expect(pullOffset(-40)).toBe(0);
    const a = pullOffset(60);
    const b = pullOffset(120);
    const c = pullOffset(400);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c).toBeLessThanOrEqual(PULL_MAX_PX);
    expect(pullOffset(10_000)).toBeLessThanOrEqual(PULL_MAX_PX);
    // The threshold can be reached: a hand's length of pull is enough.
    expect(pullOffset(200)).toBeGreaterThanOrEqual(PULL_THRESHOLD_PX);
  });

  it("refreshes only past the threshold", () => {
    expect(pullRelease(PULL_THRESHOLD_PX - 1)).toBe("settle");
    expect(pullRelease(PULL_THRESHOLD_PX)).toBe("refresh");
    expect(pullRelease(0)).toBe("settle");
  });
});
