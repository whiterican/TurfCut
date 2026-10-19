/**
 * The clock on a pay dispute (M9): two deadlines in business days from the
 * moment it opens. Pure; pay-data reads the facts and the pages show the
 * dates. A missed deadline is a fact to show and tell the pay roles about,
 * never a verdict: nothing here moves money or decides the dispute.
 *
 * Business days are Monday to Friday in UTC; public holidays aren't known
 * here, so a holiday counts as a working day (an organization is better
 * early than a worker left waiting).
 */

export const DISPUTE_SLA = {
  /** The organization's first message or the resolution, within this many business days. */
  firstResponseDays: 3,
  /** The resolution, within this many business days. */
  resolutionDays: 10,
} as const;

const DAY = 86_400_000;
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

/** `from` plus `n` business days, keeping the time of day; from a weekend, Monday is the first business day. */
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from.getTime());
  let left = n;
  while (left > 0) {
    d.setTime(d.getTime() + DAY);
    if (!isWeekend(d)) left--;
  }
  // Landing on a weekend can't happen above, but a weekend start with n = 0 would: roll to Monday.
  while (isWeekend(d)) d.setTime(d.getTime() + DAY);
  return d;
}

/** Whole business days from `a` to `b` (0 when b is before a), for a statement's "days to resolution". */
export function businessDaysBetween(a: Date, b: Date): number {
  if (b <= a) return 0;
  let n = 0;
  const d = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()));
  const end = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  while (d.getTime() < end) {
    d.setTime(d.getTime() + DAY);
    if (!isWeekend(d)) n++;
  }
  return n;
}

export interface DisputeClockFacts {
  openedAt: Date;
  /** The organization's first message in the thread, or null. */
  firstOrgReplyAt: Date | null;
  resolvedAt: Date | null;
}

export interface DisputeClock {
  firstResponseDue: Date;
  resolutionDue: Date;
  /** When the first-response deadline was met (a reply or the resolution), or null while open. */
  firstResponseMetAt: Date | null;
  /** Which deadline is being missed right now, or null. Resolved disputes are never overdue. */
  overdue: "first" | "resolution" | null;
  /** The next deadline still to meet, or null once resolved. */
  next: { kind: "first" | "resolution"; due: Date } | null;
  /** Business days from opening to the first response and to the resolution, where they happened. */
  daysToFirstResponse: number | null;
  daysToResolution: number | null;
}

export function disputeClock(f: DisputeClockFacts, now: Date): DisputeClock {
  const firstResponseDue = addBusinessDays(f.openedAt, DISPUTE_SLA.firstResponseDays);
  const resolutionDue = addBusinessDays(f.openedAt, DISPUTE_SLA.resolutionDays);
  const firstResponseMetAt = f.firstOrgReplyAt ?? f.resolvedAt;
  const overdue: DisputeClock["overdue"] = f.resolvedAt ? null : !firstResponseMetAt && now > firstResponseDue ? "first" : now > resolutionDue ? "resolution" : null;
  const next: DisputeClock["next"] = f.resolvedAt ? null : !firstResponseMetAt ? { kind: "first", due: firstResponseDue } : { kind: "resolution", due: resolutionDue };
  return {
    firstResponseDue,
    resolutionDue,
    firstResponseMetAt,
    overdue,
    next,
    daysToFirstResponse: firstResponseMetAt ? businessDaysBetween(f.openedAt, firstResponseMetAt) : null,
    daysToResolution: f.resolvedAt ? businessDaysBetween(f.openedAt, f.resolvedAt) : null,
  };
}

/**
 * The clock in words for a page: the deadline is a moment (it keeps the
 * opening's time of day), so the page shows it with the viewer's own clock
 * (`LocalTime`) between `before` and `after`. A supervisor reads about the
 * organization, never "you".
 */
export function clockParts(c: DisputeClock, viewer: "worker" | "org" | "supervisor", orgName: string): { before: string; due: Date; after: string; overdue: boolean } | null {
  if (!c.next) return null;
  const they = viewer === "org" ? "You" : orgName;
  const has = viewer === "org" ? "have" : "has";
  const verb = c.next.kind === "first" ? "reply" : "resolve this";
  if (c.overdue) {
    return viewer === "org"
      ? { before: `Overdue: this was due to be ${c.next.kind === "first" ? "answered" : "resolved"} by`, due: c.next.due, after: ".", overdue: true }
      : { before: `${orgName} was due to ${verb} by`, due: c.next.due, after: " and hasn't yet.", overdue: true };
  }
  return { before: `${they} ${has} until`, due: c.next.due, after: ` to ${verb}.`, overdue: false };
}

/** The same in one string, for logs and checks (dates through `dateText`). */
export function clockText(c: DisputeClock, viewer: "worker" | "org", orgName: string, dateText: (d: Date) => string): string {
  if (!c.next) return "";
  const they = viewer === "worker" ? orgName : "You";
  const verb = c.next.kind === "first" ? "reply" : "resolve this";
  if (c.overdue) return viewer === "worker" ? `${orgName} was due to ${verb} by ${dateText(c.next.due)} and hasn't yet.` : `Overdue: this was due to be ${c.next.kind === "first" ? "answered" : "resolved"} by ${dateText(c.next.due)}.`;
  return `${they} ${viewer === "worker" ? "has" : "have"} until ${dateText(c.next.due)} to ${verb}.`;
}
