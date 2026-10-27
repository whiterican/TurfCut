/**
 * P1.6: the pure side of saving and hiding jobs on the feed. A mark is the
 * worker's own and private: it never ranks jobs or people (the isolation
 * test holds matching, scorecards and the feed's data layer away from it).
 */
export type Mark = "save" | "unsave" | "hide" | "unhide";
export const MARKS: readonly Mark[] = ["save", "unsave", "hide", "unhide"];
export const isMark = (v: unknown): v is Mark => typeof v === "string" && (MARKS as readonly string[]).includes(v);

/** What this worker has marked, as the feed needs it. */
export interface Marks {
  saved: ReadonlySet<string>;
  hidden: ReadonlySet<string>;
}

/** A swipe commits past this share of the card's width, or sooner when it's flicked. */
export const SWIPE_COMMIT_FRACTION = 0.35;
export const SWIPE_FLICK_PX_PER_MS = 0.6;
/** Below this the pointer is a tap or a scroll, not a swipe. */
export const SWIPE_START_PX = 10;

/**
 * What a released swipe means: right saves, left hides, anything short
 * springs back. `dx` is the horizontal travel, `vx` the release speed.
 */
export function swipeOutcome(dx: number, vx: number, width: number): "save" | "hide" | null {
  if (!Number.isFinite(dx) || !Number.isFinite(width) || width <= 0) return null;
  const far = Math.abs(dx) >= width * SWIPE_COMMIT_FRACTION;
  const flick = Math.abs(dx) >= SWIPE_START_PX * 2 && Math.abs(vx) >= SWIPE_FLICK_PX_PER_MS && Math.sign(vx) === Math.sign(dx);
  if (!far && !flick) return null;
  return dx > 0 ? "save" : "hide";
}

/**
 * The feed's open jobs after the worker's marks: hidden ones leave the list
 * (shown only on request), saved ones stay where they are. Order is never
 * changed: a mark is not a rank.
 */
export function applyMarks<T extends { id: string }>(jobs: readonly T[], marks: Marks, view: { savedOnly?: boolean; showHidden?: boolean } = {}): { shown: T[]; hiddenCount: number } {
  let hiddenCount = 0;
  const shown: T[] = [];
  for (const j of jobs) {
    const hidden = marks.hidden.has(j.id);
    if (hidden) hiddenCount++;
    if (view.showHidden ? !hidden : hidden) continue;
    if (view.savedOnly && !marks.saved.has(j.id)) continue;
    shown.push(j);
  }
  return { shown, hiddenCount };
}
