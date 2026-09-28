/**
 * Pure scorecard metric formulas (spec: data model rules).
 *
 * - Active time EXCLUDES paused time (spec: "exclude paused time from
 *   active-hour rates").
 * - All rates are computed from append-only work events; these functions take
 *   plain numbers so they stay testable without a database.
 * - Minimum-sample rule lives with the caller (M3): a rate is only meaningful
 *   past the job's minimum sample size.
 */

export interface ShiftTotals {
  /** Milliseconds of active (non-paused) time on shift. */
  activeMs: number;
  doorsKnocked: number;
  contacts: number;
  signaturesSubmitted: number;
  signaturesAccepted: number;
  shiftsCompleted: number;
  shiftsScheduled: number;
}

/** Active hours from check-in/out timestamps and pause intervals. */
export function activeHours(
  checkIn: Date,
  checkOut: Date,
  pauses: Array<{ start: Date; end: Date }> = []
): number {
  const totalMs = checkOut.getTime() - checkIn.getTime();
  const pausedMs = pauses.reduce(
    (sum, p) => sum + Math.max(0, p.end.getTime() - p.start.getTime()),
    0
  );
  return Math.max(0, (totalMs - pausedMs) / 3_600_000);
}

export function doorsPerActiveHour(t: ShiftTotals): number | null {
  const hours = t.activeMs / 3_600_000;
  if (hours <= 0) return null;
  return t.doorsKnocked / hours;
}

export function doorsPerCompletedShift(t: ShiftTotals): number | null {
  if (t.shiftsCompleted <= 0) return null;
  return t.doorsKnocked / t.shiftsCompleted;
}

export function contactRate(t: ShiftTotals): number | null {
  if (t.doorsKnocked <= 0) return null;
  return t.contacts / t.doorsKnocked;
}

export function signaturesPerActiveHour(t: ShiftTotals): number | null {
  const hours = t.activeMs / 3_600_000;
  if (hours <= 0) return null;
  return t.signaturesSubmitted / hours;
}

/** Accepted / submitted — stored separately per the spec. */
export function acceptanceRate(t: ShiftTotals): number | null {
  if (t.signaturesSubmitted <= 0) return null;
  return t.signaturesAccepted / t.signaturesSubmitted;
}

export function showRate(t: ShiftTotals): number | null {
  if (t.shiftsScheduled <= 0) return null;
  return t.shiftsCompleted / t.shiftsScheduled;
}
