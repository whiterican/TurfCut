import { describe, expect, it } from "vitest";
import { closesDrawer, edgeOf, opensDrawer, EDGE_SWIPE_MIN_PX, EDGE_ZONE_PX } from "./edge-swipe";

const W = 390;

describe("opening the menu drawer with a swipe", () => {
  it("knows the two edges and nothing between", () => {
    expect(edgeOf({ x: 0, y: 300 }, W)).toBe("left");
    expect(edgeOf({ x: EDGE_ZONE_PX, y: 300 }, W)).toBe("left");
    expect(edgeOf({ x: W - EDGE_ZONE_PX, y: 300 }, W)).toBe("right");
    expect(edgeOf({ x: EDGE_ZONE_PX + 1, y: 300 }, W)).toBeNull();
    expect(edgeOf({ x: 200, y: 300 }, W)).toBeNull();
  });

  it("opens on a swipe inward from either edge", () => {
    expect(opensDrawer({ x: 10, y: 300 }, { x: 10 + EDGE_SWIPE_MIN_PX, y: 305 }, W)).toBe(true);
    expect(opensDrawer({ x: W - 10, y: 300 }, { x: W - 10 - EDGE_SWIPE_MIN_PX, y: 295 }, W)).toBe(true);
  });

  it("does not open on a short swipe, a swipe outward, a swipe from the middle, or a scroll", () => {
    expect(opensDrawer({ x: 10, y: 300 }, { x: 10 + EDGE_SWIPE_MIN_PX - 1, y: 300 }, W)).toBe(false);
    expect(opensDrawer({ x: 20, y: 300 }, { x: 0, y: 300 }, W)).toBe(false);
    expect(opensDrawer({ x: W - 10, y: 300 }, { x: W, y: 300 }, W)).toBe(false);
    expect(opensDrawer({ x: 120, y: 300 }, { x: 320, y: 300 }, W)).toBe(false);
    // Mostly downward: a scroll that drifted sideways.
    expect(opensDrawer({ x: 10, y: 300 }, { x: 90, y: 420 }, W)).toBe(false);
  });

  it("closes on a swipe to the left, not to the right and not on a scroll", () => {
    expect(closesDrawer({ x: 250, y: 300 }, { x: 250 - EDGE_SWIPE_MIN_PX, y: 310 })).toBe(true);
    expect(closesDrawer({ x: 100, y: 300 }, { x: 250, y: 300 })).toBe(false);
    expect(closesDrawer({ x: 250, y: 300 }, { x: 170, y: 420 })).toBe(false);
  });
});
