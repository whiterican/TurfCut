/**
 * Opening the menu drawer with a swipe (Caden, Nov 10): a horizontal swipe in from either edge of
 * the screen opens it, and a swipe to the left on the open drawer closes it. Pure rules;
 * components/AppNav drives them. Only on phones, where the dock and drawer are.
 */

/** A swipe has to begin this close to the left or right edge of the screen. */
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

/** True when a touch that began at an edge has travelled far enough inward, and mostly sideways, to open the drawer. */
export function opensDrawer(start: Point, end: Point, width: number): boolean {
  const edge = edgeOf(start, width);
  if (!edge) return false;
  const dx = end.x - start.x;
  const inward = edge === "left" ? dx : -dx;
  return inward >= EDGE_SWIPE_MIN_PX && Math.abs(dx) >= SWIPE_SLOPE * Math.abs(end.y - start.y);
}

/** True when a swipe on the open drawer goes far enough to the left, and mostly sideways, to close it. */
export function closesDrawer(start: Point, end: Point): boolean {
  const dx = end.x - start.x;
  return -dx >= EDGE_SWIPE_MIN_PX && Math.abs(dx) >= SWIPE_SLOPE * Math.abs(end.y - start.y);
}

/** Things that own a sideways drag themselves: a swipe that begins on one never opens the drawer. */
export const SWIPE_OWNERS = ".swipe-card, .leaflet-container, input, textarea, select, [contenteditable], [data-no-edge-swipe]";
