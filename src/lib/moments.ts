/**
 * The pure parts of P1.4's field-worker moments, browser-safe and tested:
 * count-up frames, ring geometry, the connection pill's state, and when a
 * pay line earns its "paid" morph. No timing lives here; durations come from
 * the motion tokens (lib/motion.ts) where these are used.
 */

/** Ease-out (cubic) for count-ups: quick at first, settling on the value. */
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * The number a count-up shows at progress t (0..1) from `from` to `to`.
 * Whole steps only, and it never passes the target in either direction, so
 * a count of signatures never shows a number that wasn't real at one end.
 */
export function countAt(from: number, to: number, t: number): number {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return to;
  const v = from + (to - from) * easeOut(t);
  return to >= from ? Math.min(to, Math.floor(v)) : Math.max(to, Math.ceil(v));
}

/** A ring's fill, 0..1, from a fraction that may be missing or out of range. */
export const ringFill = (fraction: number | null | undefined) =>
  fraction === null || fraction === undefined || !Number.isFinite(fraction) ? 0 : Math.min(1, Math.max(0, fraction));

/** The shift ring: share of the scheduled time worked so far. */
export const shiftFill = (workedMs: number, scheduledMs: number) => (scheduledMs > 0 ? ringFill(workedMs / scheduledMs) : 0);

export type PillState = "online" | "offline" | "syncing" | "waiting" | "refused";

/** The connection pill on the field-day card: one state, most urgent first. */
export function pillState(o: { online: boolean; reachable: boolean; syncing: boolean; waiting: number; refused: number }): PillState {
  if (o.refused > 0) return "refused";
  if (!o.online || !o.reachable) return "offline";
  if (o.syncing) return "syncing";
  if (o.waiting > 0) return "waiting";
  return "online";
}

/** Statuses that mean "on its way", from which arriving at PAID is worth showing. */
const ON_THE_WAY = new Set(["APPROVED", "PROCESSING"]);

/** A pay line morphs to paid once: when this phone last saw it on its way and now it's paid. */
export const morphsToPaid = (lastSeen: string | null, now: string) => now === "PAID" && lastSeen !== null && ON_THE_WAY.has(lastSeen);
