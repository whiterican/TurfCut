import { describe, expect, it } from "vitest";
import { closesDrawer, edgeOf, opensDrawer, tracksTouch, EDGE_SWIPE_MIN_PX, EDGE_ZONE_PX, SWIPE_OWNERS, type TouchStart } from "./edge-swipe";

const W = 390;

describe("opening the menu drawer with a swipe", () => {
  it("knows the two edges and nothing between", () => {
    expect(edgeOf({ x: 0, y: 300 }, W)).toBe("left");
    expect(edgeOf({ x: EDGE_ZONE_PX, y: 300 }, W)).toBe("left");
    expect(edgeOf({ x: W - EDGE_ZONE_PX, y: 300 }, W)).toBe("right");
    expect(edgeOf({ x: EDGE_ZONE_PX + 1, y: 300 }, W)).toBeNull();
    expect(edgeOf({ x: 200, y: 300 }, W)).toBeNull();
  });

  it("opens on a swipe to the right from the left edge, and never from the right edge", () => {
    expect(opensDrawer({ x: 10, y: 300 }, { x: 10 + EDGE_SWIPE_MIN_PX, y: 305 }, W)).toBe(true);
    expect(opensDrawer({ x: W - 10, y: 300 }, { x: W - 10 - EDGE_SWIPE_MIN_PX, y: 295 }, W)).toBe(false);
    expect(opensDrawer({ x: W - 10, y: 300 }, { x: 40, y: 300 }, W)).toBe(false);
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

  it("holds the slope at its boundary and the right edge's zone to the pixel", () => {
    expect(opensDrawer({ x: 0, y: 0 }, { x: 90, y: 60 }, W)).toBe(true); // exactly 1.5 : 1
    expect(opensDrawer({ x: 0, y: 0 }, { x: 90, y: 61 }, W)).toBe(false);
    expect(closesDrawer({ x: 200, y: 0 }, { x: 110, y: 60 })).toBe(true);
    expect(closesDrawer({ x: 200, y: 0 }, { x: 200 - EDGE_SWIPE_MIN_PX + 1, y: 0 })).toBe(false);
    expect(edgeOf({ x: W - EDGE_ZONE_PX - 1, y: 0 }, W)).toBeNull();
    expect(opensDrawer({ x: W - 5, y: 300 }, { x: W - 90, y: 420 }, W)).toBe(false);
  });

  const base: TouchStart = { phone: true, touches: 1, onDrawer: false, otherDialogOpen: false, onOwner: false, inScroller: false, menuVisible: true, zoomed: false, start: { x: 5, y: 300 }, width: W };
  it("follows a touch only where the swipe stands in for a visible menu button, and never over another gesture", () => {
    expect(tracksTouch(base)).toBe(true);
    expect(tracksTouch({ ...base, start: { x: W - 5, y: 300 } })).toBe(false); // the right edge opens nothing
    expect(tracksTouch({ ...base, start: { x: 200, y: 300 } })).toBe(false);
    expect(tracksTouch({ ...base, phone: false })).toBe(false);
    expect(tracksTouch({ ...base, touches: 2 })).toBe(false);
    expect(tracksTouch({ ...base, zoomed: true })).toBe(false);
    // The admin console and print hide the menu button: no hidden way in.
    expect(tracksTouch({ ...base, menuVisible: false })).toBe(false);
    expect(tracksTouch({ ...base, otherDialogOpen: true })).toBe(false);
    expect(tracksTouch({ ...base, onOwner: true })).toBe(false);
    expect(tracksTouch({ ...base, inScroller: true })).toBe(false);
    // On the open drawer any single touch is followed (to close it), wherever it begins.
    expect(tracksTouch({ ...base, onDrawer: true, start: { x: 200, y: 300 }, menuVisible: false })).toBe(true);
  });

  it("leaves job cards, maps (before and after the map loads) and fields their own drags", () => {
    for (const s of [".swipe-card", ".turf-map", ".leaflet-container", "input", "textarea"]) expect(SWIPE_OWNERS.split(", ")).toContain(s);
  });
});
