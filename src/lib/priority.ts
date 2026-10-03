/**
 * How urgent a shift is for the person looking at it, 0–3. Drawn as gold
 * rings on the shift card (one per level, darker toward the outside edge),
 * so a glance says "now", "today" or "coming up" without reading.
 */
export type Priority = 0 | 1 | 2 | 3;

const H = 3_600_000;

export function shiftPriority(
  s: { startsAt: Date; endsAt: Date; status: string; checkInAt: Date | null; checkOutAt: Date | null },
  now: Date = new Date()
): Priority {
  if (s.status === "CANCELLED" || s.checkOutAt || s.status === "COMPLETED") return 0;
  const t = now.getTime();
  if (s.endsAt.getTime() < t) return 0; // over without a check-out: nothing to do now
  const live = s.checkInAt !== null;
  const untilStart = s.startsAt.getTime() - t;
  if (live || untilStart <= 2 * H) return 3; // on shift, or check-in within two hours
  if (untilStart <= 24 * H) return 2; // today
  return 1; // coming up
}
