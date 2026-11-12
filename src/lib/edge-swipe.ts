/**
 * Opening the menu drawer with a swipe (Caden, Nov 10): a horizontal swipe in from the left edge of
 * the screen, where the drawer comes from, opens it, and a swipe to the left on the open drawer closes
 * it. One direction each way (Caden, Nov 11: a swipe from the right edge opened it too, which he did not want). Pure rules;
 * components/AppNav drives them. Only on phones, where the dock and drawer are.
 */

/** A swipe has to begin this close to the left edge of the screen. */
export const EDGE_ZONE_PX = 32;
/** ...and travel at least this far toward the middle. */
export const EDGE_SWIPE_MIN_PX = 72;
/** Sideways travel must be at least this many times the up-and-down travel, or it is a scroll. */
export const SWIPE_SLOPE = 1.5;

export interface Point {
  x: number;
  y: number;
}

/** Which edge a touch began at, if either. */
export function edgeOf(start: Point, width: number): "left" | "right" | null {
  if (start.x <= EDGE_ZONE_PX) return "left";
  if (start.x >= width - EDGE_ZONE_PX) return "right";
  return null;
}

/** True when a touch that began at the left edge has travelled far enough to the right, and mostly sideways, to open the drawer. */
export function opensDrawer(start: Point, end: Point, width: number): boolean {
  if (edgeOf(start, width) !== "left") return false;
  const dx = end.x - start.x;
  return dx >= EDGE_SWIPE_MIN_PX && Math.abs(dx) >= SWIPE_SLOPE * Math.abs(end.y - start.y);
}

/** True when a swipe on the open drawer goes far enough to the left, and mostly sideways, to close it. */
export function closesDrawer(start: Point, end: Point): boolean {
  const dx = end.x - start.x;
  return -dx >= EDGE_SWIPE_MIN_PX && Math.abs(dx) >= SWIPE_SLOPE * Math.abs(end.y - start.y);
}

/** Things that own a sideways drag themselves: a swipe that begins on one never opens the drawer. */
export const SWIPE_OWNERS = ".swipe-card, .turf-map, .leaflet-container, input, textarea, select, [contenteditable], [data-no-edge-swipe]";

/** What the handler knows when a finger lands. */
export interface TouchStart {
  /** Under 768 wide, where the dock and drawer are. */
  phone: boolean;
  /** Fingers on the screen. */
  touches: number;
  /** The touch began on the open drawer (or its dimmed backdrop). */
  onDrawer: boolean;
  /** Some other dialog is open: its gestures are its own. */
  otherDialogOpen: boolean;
  /** The touch began on something in SWIPE_OWNERS. */
  onOwner: boolean;
  /** The touch began inside something that scrolls sideways (a chip row, a wide table). */
  inScroller: boolean;
  /** A menu button is on screen: the swipe only ever stands in for a control the person can see. */
  menuVisible: boolean;
  /** The page is pinch-zoomed: a sideways drag pans it. */
  zoomed: boolean;
  start: Point;
  width: number;
}

/** Whether to follow this touch at all: to close the drawer if it began on it, to open it otherwise. */
export function tracksTouch(t: TouchStart): boolean {
  if (!t.phone || t.touches !== 1 || t.zoomed) return false;
  if (t.onDrawer) return true;
  if (!t.menuVisible || t.otherDialogOpen || t.onOwner || t.inScroller) return false;
  return edgeOf(t.start, t.width) === "left";
}
