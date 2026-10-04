import { describe, expect, it } from "vitest";
import { MIN_DELTA, nextHidden, SHOW_NEAR_TOP } from "./scroll-hide";

describe("nextHidden (phone tab bar on scroll)", () => {
  const deep = SHOW_NEAR_TOP + 500;

  it("hides when scrolling down past the top", () => {
    expect(nextHidden(false, deep, deep + MIN_DELTA)).toBe(true);
  });

  it("shows again on any real scroll up", () => {
    expect(nextHidden(true, deep, deep - MIN_DELTA)).toBe(false);
  });

  it("always shows near the top of the page, whichever way you move", () => {
    expect(nextHidden(true, SHOW_NEAR_TOP + 40, SHOW_NEAR_TOP)).toBe(false);
    expect(nextHidden(true, 0, SHOW_NEAR_TOP)).toBe(false);
    expect(nextHidden(true, 10, -30)).toBe(false); // iOS overscroll at the top
  });

  it("ignores small moves either way, keeping the current state", () => {
    expect(nextHidden(false, deep, deep + MIN_DELTA - 1)).toBe(false);
    expect(nextHidden(true, deep, deep - (MIN_DELTA - 1))).toBe(true);
  });
});
