/**
 * Worker availability (C2.4): the usual week, date exceptions and a note.
 * Pure — availability-data.ts loads and saves. Times are the worker's local
 * wall-clock times ("09:00"), as they'd say them; nothing here is scored or
 * ranked, and an organization sees only the plain summary, when the worker
 * shares availability with it.
 */
import type { Validated } from "@/lib/experience";

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
export const DAY_LABELS: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
export const DAY_NAMES: Record<Day, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

/** A time range on one day: "09:00" to "15:00"; "24:00" ends at midnight. */
export interface TimeRange {
  from: string;
  to: string;
}

/** A date that differs from the usual week. No ranges = not available that day. */
export interface DateException {
  date: string;
  ranges: TimeRange[];
}

export interface Availability {
  weekly: Partial<Record<Day, TimeRange[]>>;
  exceptions: DateException[];
  note: string | null;
}

export const EMPTY_AVAILABILITY: Availability = { weekly: {}, exceptions: [], note: null };
export const MAX_RANGES_PER_DAY = 2;
export const MAX_EXCEPTIONS = 40;
export const NOTE_MAX = 500;
const ALL_DAY: TimeRange = { from: "00:00", to: "24:00" };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function validDate(v: string): boolean {
  if (!DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Ranges for one day: well-formed, start before end, at most two, not overlapping. Sorted. */
function ranges(raw: unknown): TimeRange[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_RANGES_PER_DAY) return null;
  const out: TimeRange[] = [];
  for (const r of raw) {
    const o = obj(r);
    if (!o || Object.keys(o).some((k) => k !== "from" && k !== "to")) return null;
    const { from, to } = o;
    if (typeof from !== "string" || typeof to !== "string" || !TIME.test(from) || !TIME.test(to) || from === "24:00") return null;
    if (minutes(from) >= minutes(to)) return null;
    out.push({ from, to });
  }
  out.sort((a, b) => minutes(a.from) - minutes(b.from));
  for (let i = 1; i < out.length; i++) if (minutes(out[i].from) < minutes(out[i - 1].to)) return null;
  return out;
}

export function validateAvailability(raw: unknown): Validated<Availability> {
  const errors: Record<string, string> = {};
  const r = obj(raw) ?? {};

  const weekly: Partial<Record<Day, TimeRange[]>> = {};
  const w = obj(r.weekly);
  if (!w || Object.keys(w).some((k) => !(DAYS as readonly string[]).includes(k))) {
    errors.weekly = "Something's wrong with your usual week. Reload and try again.";
  } else {
    for (const day of DAYS) {
      if (w[day] === undefined) continue;
      const rs = ranges(w[day]);
      if (!rs) errors[day] = `${DAY_NAMES[day]}: up to ${MAX_RANGES_PER_DAY} times, each starting before it ends, not overlapping.`;
      else if (rs.length) weekly[day] = rs;
    }
  }

  const exceptions: DateException[] = [];
  if (!Array.isArray(r.exceptions) || r.exceptions.length > MAX_EXCEPTIONS) {
    errors.exceptions = `Up to ${MAX_EXCEPTIONS} dates.`;
  } else {
    const seen = new Set<string>();
    for (const e of r.exceptions) {
      const o = obj(e);
      const rs = o ? ranges(o.ranges) : null;
      if (!o || typeof o.date !== "string" || !validDate(o.date) || !rs || Object.keys(o).some((k) => k !== "date" && k !== "ranges")) {
        errors.exceptions = "Each date needs a real day and, if you're free, times that start before they end.";
        break;
      }
      if (seen.has(o.date)) {
        errors.exceptions = `${o.date} is listed twice.`;
        break;
      }
      seen.add(o.date);
      exceptions.push({ date: o.date, ranges: rs });
    }
    exceptions.sort((a, b) => a.date.localeCompare(b.date));
  }

  let note: string | null = null;
  if (r.note !== undefined && r.note !== null) {
    if (typeof r.note !== "string" || r.note.length > NOTE_MAX * 2) errors.note = `Keep the note under ${NOTE_MAX} characters.`;
    else {
      const t = r.note.trim();
      if (t.length > NOTE_MAX) errors.note = `Keep the note under ${NOTE_MAX} characters.`;
      else if (HIDDEN.test(t)) errors.note = "The note has a character that can't be shown.";
      else note = t || null;
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { weekly, exceptions, note } };
}

export function sameAvailability(a: Availability, b: Availability): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function canonical(a: Availability) {
  return {
    weekly: DAYS.map((d) => a.weekly[d] ?? []),
    exceptions: [...a.exceptions].sort((x, y) => x.date.localeCompare(y.date)),
    note: a.note,
  };
}

/** A stored row (JSON columns) back into availability; anything malformed reads as empty. */
export function availabilityFromRow(row: { weekly: unknown; exceptions: unknown; note: string | null }): Availability {
  const v = validateAvailability({ weekly: row.weekly, exceptions: row.exceptions, note: row.note });
  return v.ok ? v.value : EMPTY_AVAILABILITY;
}

export const isEmptyAvailability = (a: Availability) =>
  DAYS.every((d) => !a.weekly[d]?.length) && a.exceptions.length === 0 && !a.note;

/** "9am", "3:30pm", "midnight", "noon". */
export function timeText(t: string): string {
  if (t === "24:00" || t === "00:00") return "midnight";
  if (t === "12:00") return "noon";
  const h = Number(t.slice(0, 2));
  const m = t.slice(3);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m === "00" ? "" : `:${m}`}${h < 12 ? "am" : "pm"}`;
}

const isAllDay = (rs: TimeRange[]) => rs.length === 1 && rs[0].from === ALL_DAY.from && rs[0].to === ALL_DAY.to;
const rangesText = (rs: TimeRange[]) => (isAllDay(rs) ? "all day" : rs.map((r) => `${timeText(r.from)}–${timeText(r.to)}`).join(" and "));

const dateText = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The plain statement an organization sees, e.g. "Usually free Sat 9am–3pm
 * and Sun all day." plus the next few exceptions from `today` on. Days with
 * the same times are grouped ("Mon, Wed 6pm–9pm").
 */
export function availabilitySummary(a: Availability, today: string, maxExceptions = 3): { usual: string | null; dates: string[]; note: string | null } {
  const groups: Array<{ days: Day[]; text: string }> = [];
  for (const d of DAYS) {
    const rs = a.weekly[d];
    if (!rs?.length) continue;
    const text = rangesText(rs);
    const g = groups.find((x) => x.text === text);
    if (g) g.days.push(d);
    else groups.push({ days: [d], text });
  }
  const usual = groups.length
    ? `Usually free ${groups.map((g) => `${g.days.map((d) => DAY_LABELS[d]).join(", ")} ${g.text}`).join("; ")}.`
    : null;
  const dates = a.exceptions
    .filter((e) => e.date >= today)
    .slice(0, maxExceptions)
    .map((e) => (e.ranges.length ? `${dateText(e.date)}: free ${rangesText(e.ranges)}` : `${dateText(e.date)}: not available`));
  return { usual, dates, note: a.note };
}

export { ALL_DAY };
