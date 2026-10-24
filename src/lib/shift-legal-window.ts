import { parseComplianceInstant } from "./compliance-policy";
/**
 * Scheduling guard for counsel-approved, activity-scoped local-hours rules.
 * This module is intentionally not wired to shift creation yet: current
 * jurisdiction profiles lack vetted work-activity/timezone legal windows.
 * Passing this check is NOT legal authorization for a field operation.
 */
export interface ApprovedShiftWindow {
  /** IANA time zone for the work location, e.g. America/New_York. */
  timezone: string;
  /** 0 = Sunday, through 6 = Saturday. */
  allowedWeekdays: readonly number[];
  /** "HH:MM" in work-location local time; end is exclusive. */
  localStart: string;
  localEnd: string;
  /** YYYY-MM-DD in location-local time. */
  blockedDates?: readonly string[];
  /** Traceable approval state for one legally scoped rule. */
  approved: boolean;
  /** Absolute expiry; reapproval required before scheduling. */
  expiresAt: string;
  /** Exact job activity and jurisdiction that the reviewer approved. */
  activity: string;
  jurisdiction: string;
}

export interface ShiftLegalityContext {
  startsAt: Date;
  endsAt: Date;
  activity: string;
  jurisdiction: string;
}

export interface ShiftLegalityResult {
  allowedByConfiguredWindow: boolean;
  reasons: string[];
}

/**
 * Conservative *window-only* check. Does NOT inspect permits, electioneering,
 * wages, property access, consent or statutes; those require separate gates.
 * Checks each minute of a bounded shift to handle midnight and DST changes.
 */
export function checkApprovedShiftWindow(
  shift: ShiftLegalityContext,
  rule: ApprovedShiftWindow | null,
  now = new Date(),
): ShiftLegalityResult {
  const denied = (reason: string): ShiftLegalityResult => ({
    allowedByConfiguredWindow: false, reasons: [reason],
  });
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) return denied("No valid approved scheduling rule is on file.");
  if (!shift || typeof shift !== "object" || Array.isArray(shift)) return denied("Shift details are invalid.");
  if (rule.approved !== true) return denied("Scheduling rule is not approved.");
  if (typeof rule.jurisdiction !== "string" || !rule.jurisdiction.trim() || rule.jurisdiction !== rule.jurisdiction.trim() ||
      typeof shift.jurisdiction !== "string" || !shift.jurisdiction.trim() || shift.jurisdiction !== shift.jurisdiction.trim() ||
      typeof rule.activity !== "string" || !rule.activity.trim() ||
      typeof shift.activity !== "string" || !shift.activity.trim() ||
      rule.jurisdiction !== shift.jurisdiction || rule.activity !== shift.activity) {
    return denied("Scheduling rule does not match this activity and jurisdiction.");
  }
  const expires = parseComplianceInstant(rule.expiresAt);
  if (!Number.isFinite(expires) || !(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      !(shift.endsAt instanceof Date) || !Number.isFinite(shift.endsAt.getTime()) ||
      expires <= now.getTime() || expires < shift.endsAt.getTime()) {
    return denied("Scheduling rule expires before the requested shift ends.");
  }
  const start = shift.startsAt instanceof Date ? shift.startsAt.getTime() : NaN;
  const end = shift.endsAt instanceof Date ? shift.endsAt.getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 24 * 3600000) {
    return denied("Shift times must be valid, positive and no longer than 24 hours.");
  }
  const hm = (value: string) => {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };
  const opens = hm(rule.localStart);
  const closes = hm(rule.localEnd);
  if (opens === null || closes === null || opens >= closes) {
    return denied("Approved local work-hour window is invalid.");
  }
  if (!Array.isArray(rule.allowedWeekdays) || rule.allowedWeekdays.length === 0 || rule.allowedWeekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    return denied("Approved working days are missing or invalid.");
  }
  if (rule.blockedDates !== undefined &&
      (!Array.isArray(rule.blockedDates) || rule.blockedDates.some((d) => typeof d !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(d) || (() => { const [y,m,day] = d.split("-").map(Number); const normalized = new Date(Date.UTC(y,m-1,day)); return normalized.getUTCFullYear() !== y || normalized.getUTCMonth()+1 !== m || normalized.getUTCDate() !== day; })()))) {
    return denied("Approved restricted dates are invalid.");
  }
  let fmt: Intl.DateTimeFormat;
  try {
    // A region name ("America/New_York"), never UTC, an abbreviation, an offset
    // or an Etc/ zone. Validity is checked by building the formatter below (it
    // throws on an unknown zone), not against Intl.supportedValuesOf: that list
    // holds ICU's older canonical names, so it would reject current IANA names
    // such as America/Indiana/Indianapolis or America/Kentucky/Louisville.
    if (typeof rule.timezone !== "string" || !/^[A-Za-z_]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?$/.test(rule.timezone) || /^etc\//i.test(rule.timezone)) {
      return denied("Work-location time zone must be a reviewed IANA region.");
    }
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: rule.timezone, year: "numeric", month: "2-digit",
      day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit",
      hourCycle: "h23",
    });
    fmt.format(shift.startsAt);
  } catch { return denied("Work-location time zone is invalid."); }

  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const blocked = new Set(rule.blockedDates ?? []);
  // Since dates can change on a minute boundary, include the final partial
  // minute. The exclusive end is checked by looking just before it.
  for (let time = Math.floor(start / 60000) * 60000; time < end; time += 60000) {
    const instant = new Date(Math.max(time, start));
    const values = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
    const weekday = weekdays[values.weekday];
    const date = `${values.year}-${values.month}-${values.day}`;
    const minute = Number(values.hour) * 60 + Number(values.minute);
    if (weekday === undefined || !rule.allowedWeekdays.includes(weekday) || blocked.has(date) ||
        minute < opens || minute >= closes) {
      return denied(`The shift includes time outside the approved local work window (${rule.timezone}; ${date}).`);
    }
  }
  return { allowedByConfiguredWindow: true, reasons: [] };
}
