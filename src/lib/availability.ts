/**
 * Worker availability (C2.4): the usual week, date exceptions and a note.
 * Pure — availability-data.ts loads and saves. Times are the worker's local
 * wall-clock times ("09:00"), as they'd say them; nothing here is scored or
 * ranked, and an organization sees only the plain summary, when the worker
 * shares availability with it.
 */
import type { Validated } from "@/lib/experience";
import { hasHiddenChars } from "@/lib/text-guard";

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
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function validDate(v: string): boolean {
  if (!DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

type RangesResult = { ok: true; ranges: TimeRange[] } | { ok: false; why: string };

/**
 * Ranges for one day: at most two, each with both times, starting before it
 * ends, not overlapping. Sorted; back-to-back ranges are joined into one
 * (9am–noon and noon–3pm read as 9am–3pm).
 */
function ranges(raw: unknown): RangesResult {
  const shape = { ok: false as const, why: "Something's wrong with these times. Reload and try again." };
  if (!Array.isArray(raw)) return shape;
  if (raw.length > MAX_RANGES_PER_DAY) return { ok: false, why: `Up to ${MAX_RANGES_PER_DAY} times a day.` };
  const out: TimeRange[] = [];
  for (const r of raw) {
    const o = obj(r);
    if (!o || Object.keys(o).some((k) => k !== "from" && k !== "to")) return shape;
    const { from, to } = o;
    if (from === "" || to === "" || from == null || to == null) return { ok: false, why: "Fill in both times." };
    if (typeof from !== "string" || typeof to !== "string" || !TIME.test(from) || !TIME.test(to) || from === "24:00") return shape;
    if (minutes(from) >= minutes(to)) return { ok: false, why: "Each time needs to start before it ends." };
    out.push({ from, to });
  }
  out.sort((a, b) => minutes(a.from) - minutes(b.from));
  for (let i = 1; i < out.length; i++) if (minutes(out[i].from) < minutes(out[i - 1].to)) return { ok: false, why: "The two times overlap." };
  const joined = out.reduce<TimeRange[]>((acc, r) => {
    const last = acc.at(-1);
    if (last && last.to === r.from) last.to = r.to;
    else acc.push({ ...r });
    return acc;
  }, []);
  return { ok: true, ranges: joined };
}

const dateLong = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

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
      if (!rs.ok) errors[day] = `${DAY_NAMES[day]}: ${rs.why}`;
      else if (rs.ranges.length) weekly[day] = rs.ranges;
    }
  }

  const exceptions: DateException[] = [];
  if (!Array.isArray(r.exceptions)) {
    errors.exceptions = "Something's wrong with your dates. Reload and try again.";
  } else if (r.exceptions.length > MAX_EXCEPTIONS) {
    errors.exceptions = `Up to ${MAX_EXCEPTIONS} dates. Remove some you no longer need.`;
  } else {
    // One message per date, keyed by its row, so the form can point at it.
    const seen = new Set<string>();
    r.exceptions.forEach((e, i) => {
      const o = obj(e);
      if (!o || Object.keys(o).some((k) => k !== "date" && k !== "ranges")) {
        errors[`exceptions.${i}`] = "Something's wrong with this date. Remove it and add it again.";
        return;
      }
      if (typeof o.date !== "string" || !validDate(o.date)) {
        errors[`exceptions.${i}`] = "Pick a date.";
        return;
      }
      const rs = ranges(o.ranges);
      if (!rs.ok) {
        errors[`exceptions.${i}`] = rs.why;
        return;
      }
      if (seen.has(o.date)) {
        errors[`exceptions.${i}`] = `${dateLong(o.date)} is listed twice.`;
        return;
      }
      seen.add(o.date);
      exceptions.push({ date: o.date, ranges: rs.ranges });
    });
    exceptions.sort((a, b) => a.date.localeCompare(b.date));
  }

  let note: string | null = null;
  if (r.note !== undefined && r.note !== null) {
    if (typeof r.note !== "string" || r.note.length > NOTE_MAX * 2) errors.note = `Keep the note under ${NOTE_MAX} characters.`;
    else {
      const t = r.note.trim();
      if (t.length > NOTE_MAX) errors.note = `Keep the note under ${NOTE_MAX} characters.`;
      else if (hasHiddenChars(t)) errors.note = "The note has a character that can't be shown. Retype it rather than pasting.";
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

/** "Mon–Fri", "Mon, Wed", "Sat, Sun": runs of three or more days collapse. */
function daysText(days: Day[]): string {
  const idx = days.map((d) => DAYS.indexOf(d));
  const parts: string[] = [];
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    if (j - i >= 2) parts.push(`${DAY_LABELS[DAYS[idx[i]]]}–${DAY_LABELS[DAYS[idx[j]]]}`);
    else for (let k = i; k <= j; k++) parts.push(DAY_LABELS[DAYS[idx[k]]]);
    i = j + 1;
  }
  return parts.join(", ");
}

const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/**
 * Drops dates that are over (before yesterday, in UTC) from a save, so the
 * wallet of dates doesn't fill up with the past. Anything else passes through
 * untouched for validation.
 */
export function withoutPastDates(raw: unknown, today: string): unknown {
  const r = obj(raw);
  if (!r || !Array.isArray(r.exceptions)) return raw;
  const from = dayBefore(today);
  return { ...r, exceptions: r.exceptions.filter((e) => !(obj(e) && typeof obj(e)!.date === "string" && validDate(obj(e)!.date as string) && (obj(e)!.date as string) < from)) };
}

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
    ? `Usually free ${groups.map((g) => `${daysText(g.days)} ${g.text}`).join("; ")}.`
    : null;
  // From the day before `today` (a UTC date): in US evenings UTC has already
  // moved on, and the worker's own "today" must still show.
  const from = dayBefore(today);
  const dates = a.exceptions
    .filter((e) => e.date >= from)
    .slice(0, maxExceptions)
    .map((e) => (e.ranges.length ? `${dateText(e.date)}: free ${rangesText(e.ranges)}` : `${dateText(e.date)}: not available`));
  return { usual, dates, note: a.note };
}

export { ALL_DAY };
