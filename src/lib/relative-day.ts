/**
 * How far a moment is from now in whole calendar days of one time zone:
 * "today", "tomorrow", "in 3 days", "yesterday", "2 days ago". Calendar
 * days, not 24-hour spans, so 11 pm to 1 am is "tomorrow". The zone is the
 * viewer's: the server doesn't know it, so it never says these words itself
 * (components/RelativeDay renders them in the browser).
 */
export interface RelativeDay {
  kind: "today" | "tomorrow" | "in" | "yesterday" | "ago";
  /** Calendar days from now: negative in the past. */
  days: number;
  words: string;
}

/** The calendar day a moment falls on in `zone`, as YYYY-MM-DD (from the parts, so no locale's own date order can creep in). */
export function dayIn(d: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const dayNumber = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))) / 86_400_000;

/** Null for an invalid date, so a caller can show nothing rather than "NaN days ago". */
export function relativeDay(target: Date, now: Date, zone: string): RelativeDay | null {
  if (Number.isNaN(target.getTime()) || Number.isNaN(now.getTime())) return null;
  const days = dayNumber(dayIn(target, zone)) - dayNumber(dayIn(now, zone));
  if (!Number.isFinite(days)) return null;
  if (days === 0) return { kind: "today", days, words: "today" };
  if (days === 1) return { kind: "tomorrow", days, words: "tomorrow" };
  if (days === -1) return { kind: "yesterday", days, words: "yesterday" };
  if (days > 1) return { kind: "in", days, words: `in ${days} days` };
  return { kind: "ago", days, words: `${-days} days ago` };
}
