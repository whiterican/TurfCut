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
export const NO_TILT = ".swipe-card, .turf-map, .leaflet-container, .card-solid, select, input[type='range'], [data-no-tilt]";

/** A small tile dips this far at its edge; a big card far less, so it never swings. */
export const TILT_MAX_DEG = 3;
export const TILT_MIN_DEG = 0.6;
/** The longer side, in px, times its tilt in degrees stays near this: 150px dips 3°, 360px 1.25°, 750px 0.6°. */
export const TILT_REACH = 450;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * A box longer than this on either side stays still when pressed. Turning or shrinking it about its centre moves
 * its far rows: a list of fifty notices would slide the pressed row out from under the finger, and the tap would miss.
 */
export const TILT_LONGEST = 900;
export const canTilt = (box: Box) => box.width > 0 && box.height > 0 && Math.max(box.width, box.height) <= TILT_LONGEST;

/**
 * How far to turn a box pressed at (x, y), in degrees about each axis, for CSS rotateX / rotateY.
 * The pressed side goes down, away from the viewer: pressing the right edge turns the box about
 * its vertical axis by +max (rotateY), pressing the bottom edge turns it about its horizontal
 * axis by -max (rotateX). The centre does not turn it at all. A press outside the box counts as its edge.
 * Also where the press is across the card (lx, ly), which the pressed glass uses to pool its light.
 */
export function tiltFor(box: Box, x: number, y: number): { rx: number; ry: number; lx: number; ly: number } {
  if (!(box.width > 0) || !(box.height > 0)) return { rx: 0, ry: 0, lx: 0, ly: 0 };
  const max = Math.min(TILT_MAX_DEG, Math.max(TILT_MIN_DEG, TILT_REACH / Math.max(box.width, box.height)));
  const unit = (at: number, start: number, size: number) => Math.min(1, Math.max(-1, ((at - start) / size) * 2 - 1));
  const px = unit(x, box.left, box.width);
  const py = unit(y, box.top, box.height);
  const round = (n: number) => Math.round(n * 100) / 100 || 0;
  // lx / ly: where on the card the press is, -1 (left, top) to 1 (right, bottom), for the light that pools there.
  return { rx: round(-py * max), ry: round(px * max), lx: round(px), ly: round(py) };
}
