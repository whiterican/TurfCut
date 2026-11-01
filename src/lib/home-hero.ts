/**
 * What Home's hero shows (redesign §5, P0 state truth), from the worker's
 * shifts as the server has them:
 * 1. a shift under way (checked in, not past its end) — live;
 * 2. else a shift still checked in after its end — "No check-out received";
 * 3. else the next scheduled shift.
 * A live shift never hides behind an old missing check-out: that shows as a
 * separate alert above it. "Coming up" lists the scheduled shifts the hero
 * didn't show.
 */
export type HeroPick =
  | { kind: "live"; shiftId: string; overdueAlert: string | null }
  | { kind: "overdue"; shiftId: string }
  | { kind: "next"; shiftId: string }
  | { kind: "none" };

export function pickHero(live: { id: string } | null, overdue: { id: string } | null, next: { id: string } | null): HeroPick {
  if (live) return { kind: "live", shiftId: live.id, overdueAlert: overdue?.id ?? null };
  if (overdue) return { kind: "overdue", shiftId: overdue.id };
  if (next) return { kind: "next", shiftId: next.id };
  return { kind: "none" };
}

/** The scheduled shifts for "Coming up": everything not already in the hero, up to three. */
export function laterShifts<T extends { id: string }>(scheduled: T[], hero: HeroPick, max = 3): T[] {
  const shown = hero.kind === "next" ? hero.shiftId : null;
  return scheduled.filter((s) => s.id !== shown).slice(0, max);
}
