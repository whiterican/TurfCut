/**
 * Which way the page is being scrolled, for the top-bar buttons that step aside on the way down
 * (components/ScrollDirection.tsx). Pure, so it is tested without a browser.
 */

/** Near the top everything shows, whatever the direction. */
export const SCROLL_TOP_PX = 24;
/** A move smaller than this is a wobble (a finger resting, a bounce), not a direction. */
export const SCROLL_JITTER_PX = 6;

export type ScrollDir = "up" | "down";

/**
 * The direction after moving from `last` to `now`, given the direction so far. `null` keeps `last` as the
 * reference point (the move was too small to mean anything).
 */
export function scrollDirection(last: number, now: number, current: ScrollDir): ScrollDir | null {
  if (now <= SCROLL_TOP_PX) return "up";
  const moved = now - last;
  if (Math.abs(moved) < SCROLL_JITTER_PX) return null;
  return moved > 0 ? "down" : current === "up" || moved < 0 ? "up" : current;
}
