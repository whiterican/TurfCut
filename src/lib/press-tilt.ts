/**
 * Weighted cards (Caden, Nov 12): a card floats over the page, and pressing it weighs down the
 * side you press, the way a floating thing dips under a finger. Pure rules; components/PressTilt
 * drives them. Nothing happens when motion is reduced.
 */

/**
 * The boxes that float (the ones that carry the card's shadow in globals.css) and so can dip.
 * Not the job rows you swipe (they move under the finger already), not tables (they scroll),
 * and not choice lists, whose rows are the controls.
 */
export const TILT_TARGETS =
  ".card, .hero-card, .list-card, .work-card, .shift-card, .turf-card, .need-tile, .stat, .stat-tile, .summary-item, .job-photo-row, .option-card, .empty-state";

/**
 * A press that begins on one of these never dips its card: they take a drag themselves, and a card
 * rocking under a swipe, a map being panned or a picker opening is wrong. The swiped job cards hold
 * a job row, so the row is stopped here, by its wrapper.
 */
export const NO_TILT = ".swipe-card, .turf-map, .leaflet-container, select, input[type='range'], [data-no-tilt]";

/** A small tile dips this far at its edge; a big card far less, so it never swings. */
export const TILT_MAX_DEG = 6;
export const TILT_MIN_DEG = 1.2;
/** The longer side, in px, times its tilt in degrees stays near this: 150px dips 6°, 360px 2.5°, 750px 1.2°. */
export const TILT_REACH = 900;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * How far to turn a box pressed at (x, y), in degrees about each axis, for CSS rotateX / rotateY.
 * The pressed side goes down, away from the viewer: pressing the right edge turns the box about
 * its vertical axis by +max (rotateY), pressing the bottom edge turns it about its horizontal
 * axis by -max (rotateX). The centre does not turn it at all. A press outside the box counts as its edge.
 */
export function tiltFor(box: Box, x: number, y: number): { rx: number; ry: number } {
  if (!(box.width > 0) || !(box.height > 0)) return { rx: 0, ry: 0 };
  const max = Math.min(TILT_MAX_DEG, Math.max(TILT_MIN_DEG, TILT_REACH / Math.max(box.width, box.height)));
  const unit = (at: number, start: number, size: number) => Math.min(1, Math.max(-1, ((at - start) / size) * 2 - 1));
  const px = unit(x, box.left, box.width);
  const py = unit(y, box.top, box.height);
  const round = (n: number) => Math.round(n * 100) / 100 || 0;
  return { rx: round(-py * max), ry: round(px * max) };
}
