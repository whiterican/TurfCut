/**
 * Which way the page is being scrolled, for the top row that steps aside on the way down
 * (components/ScrollDirection.tsx). Pure, so it is tested without a browser.
 */

/** Near the top everything shows, whatever the direction. */
export const SCROLL_TOP_PX = 24;
/** A move smaller than this is a wobble (a finger resting, a bounce), not a direction. */
export const SCROLL_JITTER_PX = 6;

/** Past this the page has left its top: the glass across the top of the screen has something under it to blur. */
export const SCROLLED_PX = 8;

export type ScrollDir = "up" | "down";

/** Whether the page (position already clamped) has moved off its top. At rest there, nothing is under the clock to protect. */
export const isScrolled = (now: number) => now > SCROLLED_PX;

/** A position held inside the page: a phone's rubber-band past either end is not a scroll. */
export const clampScroll = (y: number, max: number) => Math.min(Math.max(y, 0), Math.max(max, 0));

/**
 * The direction after moving from `last` to `now` (both already clamped). `null` means the move was too
 * small to mean anything: keep `last` as the reference point.
 */
export function scrollDirection(last: number, now: number): ScrollDir | null {
  if (now <= SCROLL_TOP_PX) return "up";
  const moved = now - last;
  if (Math.abs(moved) < SCROLL_JITTER_PX) return null;
  return moved > 0 ? "down" : "up";
}
