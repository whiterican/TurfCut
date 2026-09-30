/**
 * Pure scorecard metric formulas (spec p.10 "Required metric definitions").
 *
 * - Active time EXCLUDES paused time (spec: "exclude paused time from
 *   active-hour rates").
 * - All rates are computed from append-only work events; these functions take
 *   plain numbers so they stay testable without a database. lib/scorecard.ts
 *   decides which (verified) shifts feed them.
 * - Minimum-sample rule lives with the caller (M3): a rate is only meaningful
 *   past the job's minimum sample size.
 */

export interface ShiftTotals {
  /** Milliseconds of verified active (non-paused) time. */
  activeMs: number;
  doorsAttempted: number;
  contacts: number;
  signaturesSubmitted: number;
  signaturesReviewed: number;
  signaturesAccepted: number;
  /** Verified completed shifts that recorded door attempts. */
  doorShiftsCompleted: number;
  /** Accepted shifts the worker started (checked in). */
  shiftsStarted: number;
  /** Accepted shifts that weren't (timely) cancelled. */
  shiftsAccepted: number;
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

/** Verified doors attempted / verified active field hours. */
export function doorsPerActiveHour(t: ShiftTotals): number | null {
  const hours = t.activeMs / 3_600_000;
  if (hours <= 0) return null;
  return t.doorsAttempted / hours;
}

/** Verified doors attempted / completed door shifts. */
export function doorsPerCompletedShift(t: ShiftTotals): number | null {
  if (t.doorShiftsCompleted <= 0) return null;
  return t.doorsAttempted / t.doorShiftsCompleted;
}

/** Resident contacts / doors attempted. */
export function contactRate(t: ShiftTotals): number | null {
  if (t.doorsAttempted <= 0) return null;
  return t.contacts / t.doorsAttempted;
}

/** Submitted signatures / verified petition hours (caller passes petition hours only). */
export function signaturesPerActiveHour(t: ShiftTotals): number | null {
  const hours = t.activeMs / 3_600_000;
  if (hours <= 0) return null;
  return t.signaturesSubmitted / hours;
}

/** Accepted signatures / signatures reviewed. */
export function acceptanceRate(t: ShiftTotals): number | null {
  if (t.signaturesReviewed <= 0) return null;
  return t.signaturesAccepted / t.signaturesReviewed;
}

/** Started accepted shifts / accepted shifts not timely cancelled. */
export function showRate(t: ShiftTotals): number | null {
  if (t.shiftsAccepted <= 0) return null;
  return t.shiftsStarted / t.shiftsAccepted;
}
