import { describe, expect, it } from "vitest";
import { clampScroll, MIN_DELTA, nextHidden, SHOW_NEAR_TOP } from "./scroll-hide";

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

  it("a bounce back from past the bottom (iOS) is not a scroll up once clamped", () => {
    const max = SHOW_NEAR_TOP + 1000;
    const peak = clampScroll(max + 40, max); // rubber-band overshoot
    expect(peak).toBe(max);
    expect(nextHidden(true, peak, clampScroll(max, max))).toBe(true);
  });

  it("clampScroll keeps positions inside the page, even a page shorter than the screen", () => {
    expect(clampScroll(-30, 500)).toBe(0);
    expect(clampScroll(520, 500)).toBe(500);
    expect(clampScroll(200, 500)).toBe(200);
    expect(clampScroll(10, -100)).toBe(0);
  });

  it("ignores small moves either way, keeping the current state", () => {
    expect(nextHidden(false, deep, deep + MIN_DELTA - 1)).toBe(false);
    expect(nextHidden(true, deep, deep - (MIN_DELTA - 1))).toBe(true);
  });
});
