/**
 * Shift slots (M8.2): open shifts staff post on a job; hired workers claim a
 * seat first come, first served, and the claim becomes a real Shift. Pure —
 * the data layer takes the locks and runs the overlap check.
 *
 * A worker's availability only orders their own list and labels each slot in
 * plain words ("Fits your availability"). It is never a score, never shown to
 * staff here, and never decides who gets a seat.
 */
import { validateShift, type ShiftInput } from "@/lib/field-day";
import type { Validated } from "@/lib/experience";
import { DAYS, type Availability, type TimeRange } from "@/lib/availability";
import { hasHiddenChars } from "@/lib/text-guard";

export const HEADCOUNT_MAX = 200;
export const SLOT_NOTES_MAX = 500;

export interface SlotInput extends ShiftInput {
  headcount: number;
  notes: string | null;
}

/** The shift form plus a headcount and optional notes for the crew. */
export function validateSlot(raw: Record<string, unknown>, job: { startsAt: Date | null; endsAt: Date | null }): Validated<SlotInput> {
  const base = validateShift(raw, job);
  const errors: Record<string, string> = base.ok ? {} : { ...base.errors };
  const hc = typeof raw.headcount === "string" ? raw.headcount.trim() : "";
  const headcount = Number(hc);
  if (!/^\d+$/.test(hc) || headcount < 1 || headcount > HEADCOUNT_MAX) errors.headcount = `Seats must be a whole number from 1 to ${HEADCOUNT_MAX}.`;
  const notes = (typeof raw.notes === "string" ? raw.notes.trim() : "") || null;
  if (notes && notes.length > SLOT_NOTES_MAX) errors.notes = `Keep notes under ${SLOT_NOTES_MAX} characters.`;
  else if (notes && hasHiddenChars(notes)) errors.notes = "Remove the hidden formatting characters from the notes.";
  if (!base.ok || Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { ...base.value, headcount, notes } };
}

export type SlotStatus = "OPEN" | "CLOSED";

export interface SlotFacts {
  status: SlotStatus;
  startsAt: Date;
  endsAt: Date;
  headcount: number;
  /** Seats held: the slot's shifts that aren't cancelled. */
  taken: number;
}

export const seatsLeft = (s: SlotFacts) => Math.max(0, s.headcount - s.taken);

export type SlotState = "open" | "full" | "closed" | "started" | "ended";

export function slotState(s: SlotFacts, now: Date): SlotState {
  if (now >= s.endsAt) return "ended";
  if (s.status === "CLOSED") return "closed";
  if (now >= s.startsAt) return "started";
  return seatsLeft(s) === 0 ? "full" : "open";
}

export function slotStateLabel(st: SlotState, left: number): { label: string; badge: string } {
  switch (st) {
    case "open":
      return { label: `${left} ${left === 1 ? "seat" : "seats"} left`, badge: "badge-success" };
    case "full":
      return { label: "Full", badge: "badge-neutral" };
    case "closed":
      return { label: "Closed", badge: "badge-neutral" };
    case "started":
      return { label: "Started", badge: "badge-neutral" };
    case "ended":
      return { label: "Ended", badge: "badge-neutral" };
  }
}

/**
 * Whether a seat can be taken now. `holdsSeat` is the worker already holding
 * one on this slot; overlap with their other shifts is checked under the
 * worker lock, not here.
 */
export function claimCheck(s: SlotFacts, holdsSeat: boolean, now: Date): { ok: true } | { ok: false; reason: string } {
  if (holdsSeat) return { ok: false, reason: "You already have a seat on this shift." };
  const st = slotState(s, now);
  if (st === "closed") return { ok: false, reason: "This shift is closed to new sign-ups." };
  if (st === "started" || st === "ended") return { ok: false, reason: "This shift has already started." };
  if (st === "full") return { ok: false, reason: "Every seat on this shift is taken." };
  return { ok: true };
}

/** Staff can't shrink a slot below the seats already held. */
export function headcountCheck(headcount: number, taken: number): string | null {
  return headcount < taken ? `${taken} ${taken === 1 ? "person has" : "people have"} already signed up; seats can't go below that.` : null;
}

// ---------------------------------------------------------------------------
// The worker's own view: availability orders and labels, nothing more
// ---------------------------------------------------------------------------

export type SlotFit = "fits" | "partly" | "outside" | "unknown";

export const SLOT_FIT_LABELS: Record<Exclude<SlotFit, "unknown">, string> = {
  fits: "Fits your availability",
  partly: "Partly in your availability",
  outside: "Outside your availability",
};

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** Wall-clock date ("2026-10-16") and minutes after midnight in a time zone. */
function localParts(d: Date, timeZone: string): { date: string; day: (typeof DAYS)[number]; min: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  const day = p.weekday.toLowerCase().slice(0, 3) as (typeof DAYS)[number];
  return { date: `${p.year}-${p.month}-${p.day}`, day, min: Number(p.hour) * 60 + Number(p.minute) };
}

function rangesOn(a: Availability, date: string, day: (typeof DAYS)[number]): TimeRange[] {
  const ex = a.exceptions.find((e) => e.date === date);
  return ex ? ex.ranges : (a.weekly[day] ?? []);
}

/**
 * How a slot sits against the worker's availability, in the slot's local
 * time. A slot that crosses midnight is judged on its start day up to
 * midnight and its end day from midnight. Availability with no usual week
 * and no upcoming dates, or an unusable time zone, is "unknown". Expects
 * validated availability (no overlapping ranges within a day).
 */
export function slotFit(slot: { startsAt: Date; endsAt: Date }, a: Availability, timeZone: string, today?: string): SlotFit {
  const hasWeek = DAYS.some((d) => a.weekly[d]?.length);
  if (!hasWeek && !a.exceptions.some((x) => !today || x.date >= today)) return "unknown";
  let s: ReturnType<typeof localParts>, e: ReturnType<typeof localParts>;
  try {
    s = localParts(slot.startsAt, timeZone);
    e = localParts(slot.endsAt, timeZone);
  } catch {
    return "unknown";
  }
  // The repeated hour when clocks fall back: wall-clock end before start.
  if (s.date === e.date && e.min <= s.min) e = { ...e, min: Math.min(1440, s.min + Math.round((slot.endsAt.getTime() - slot.startsAt.getTime()) / 60_000)) };
  const pieces: Array<{ date: string; day: (typeof DAYS)[number]; from: number; to: number }> =
    s.date === e.date ? [{ date: s.date, day: s.day, from: s.min, to: e.min }] : [{ date: s.date, day: s.day, from: s.min, to: 1440 }, ...(e.min > 0 ? [{ date: e.date, day: e.day, from: 0, to: e.min }] : [])];
  let total = 0;
  let covered = 0;
  for (const p of pieces) {
    total += p.to - p.from;
    for (const r of rangesOn(a, p.date, p.day)) covered += Math.max(0, Math.min(p.to, minutes(r.to)) - Math.max(p.from, minutes(r.from)));
  }
  if (total > 0 && covered >= total) return "fits";
  return covered > 0 ? "partly" : "outside";
}

const FIT_ORDER: Record<SlotFit, number> = { fits: 0, partly: 1, unknown: 1, outside: 2 };
const STATE_ORDER: Record<SlotState, number> = { open: 0, full: 1, started: 2, closed: 2, ended: 3 };

/** The worker's list: open slots first, then those that fit, then by start time. */
export function sortForWorker<T extends { startsAt: Date; fit: SlotFit; state: SlotState }>(slots: T[]): T[] {
  return [...slots].sort((x, y) => STATE_ORDER[x.state] - STATE_ORDER[y.state] || FIT_ORDER[x.fit] - FIT_ORDER[y.fit] || x.startsAt.getTime() - y.startsAt.getTime());
}
