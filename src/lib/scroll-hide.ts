/**
 * When the phone tab bar tucks away (the YouTube pattern): scrolling down
 * the page hides it, any scroll back up shows it again. Near the top of the
 * page it always shows. Small moves (a resting thumb, iOS rubber-banding)
 * change nothing, so the bar doesn't flicker.
 */
export const SHOW_NEAR_TOP = 64; // px from the top where the bar always shows
export const MIN_DELTA = 8; // px of movement before the bar reacts

/**
 * The scroll position within the page's real range. iOS reports positions
 * past either end while it rubber-bands; without this, the bounce back from
 * the bottom reads as a scroll up and pops the bar out.
 */
export function clampScroll(y: number, max: number): number {
  return Math.min(Math.max(y, 0), Math.max(max, 0));
}

export function nextHidden(hidden: boolean, lastY: number, y: number): boolean {
  if (y <= SHOW_NEAR_TOP) return false;
  const delta = y - lastY;
  if (delta >= MIN_DELTA) return true;
  if (delta <= -MIN_DELTA) return false;
  return hidden;
}
