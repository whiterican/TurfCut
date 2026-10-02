/**
 * Worker scorecard, derived from append-only work events (spec p.10, p.17).
 *
 * Rules:
 * - Every number comes from work_events (plus supervisor validations, which
 *   decide what is verified). Nothing reads a stored metric; nothing is
 *   hand-editable.
 * - Segmented by work type (the job's type) so unlike work is never compared,
 *   and filterable by period and state.
 * - Averages use VERIFIED shifts only: checked in, checked out, and the
 *   latest closeout validation is APPROVED. Pending and rejected shifts are
 *   counted in the verification breakdown, never in averages.
 * - Active time excludes paused time.
 * - No composite or universal score. Each metric reports its formula,
 *   numerator, denominator and evidence (sample size, hours, date range,
 *   states, verification).
 *
 * Event conventions:
 * - DOOR_KNOCK / CONTACT / SIGNATURE_SUBMITTED: payload.count (default 1).
 * - BATCH_COUNT: supervisor reconciliation — payload.reviewed, .accepted,
 *   .rejected (reviewed defaults to accepted + rejected). A recount
 *   supersedes: the latest valid count is the shift's count.
 * - CORRECTION: payload.supersedesEventId + corrected fields, and must carry
 *   payload.signedBy and payload.reason. Unsigned or unexplained corrections
 *   are ignored (and counted). The newest valid correction wins; the original
 *   row is never touched.
 * - An event whose latest event-level validation is REJECTED is excluded.
 */
import { effectiveEvents } from "@/lib/corrections";
import {
  acceptanceRate,
  activeHours,
  contactRate,
  doorsPerActiveHour,
  doorsPerCompletedShift,
  showRate,
  signaturesPerActiveHour,
  type ShiftTotals,
} from "@/lib/metrics";

export type WorkType = "PETITION" | "CANVASS";
export type Period = "lifetime" | "12m" | "90d";
export const PERIODS: Period[] = ["lifetime", "12m", "90d"];
const PERIOD_DAYS: Record<Period, number | null> = { lifetime: null, "12m": 365, "90d": 90 };

export interface ScorecardEvent {
  id: string;
  type: string;
  payload: unknown;
  createdAt: Date;
}

export interface ScorecardValidation {
  workEventId: string | null;
  status: "APPROVED" | "REJECTED" | "FLAGGED";
  createdAt: Date;
}

export interface ScorecardShift {
  id: string;
  engagementId: string;
  engagementStatus: "APPLIED" | "INVITED" | "CLAIMED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  workType: WorkType;
  state: string;
  status: "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startsAt: Date;
  endsAt: Date;
  /** When the shift was put on the schedule. */
  scheduledAt: Date;
  events: ScorecardEvent[];
  validations: ScorecardValidation[];
  /** The job's notice window: a worker cancellation later than this is a no-show. Default 24. */
  cancellationNoticeHours?: number;
  /** The job's ballot measure / initiative IDs. */
  measureIds?: string[];
  /** For the per-campaign history list. */
  jobId?: string;
  jobTitle?: string;
}

export interface CampaignHistory {
  jobId: string;
  title: string;
  workType: WorkType;
  verifiedShifts: number;
  /** Signatures accepted / reviewed at supervisor review (petition work). */
  accepted: number;
  reviewed: number;
  doors: number;
  lastAt: string;
}

export interface MetricExplanation {
  value: number | null;
  numerator: number;
  denominator: number;
  formula: string;
  evidence: string;
}

export interface ScorecardSegment {
  workType: WorkType;
  period: Period;
  /** null = all states in the segment. */
  state: string | null;
  statesWorked: string[];
  dateRange: { from: string; to: string } | null;
  /** dateRange for people: "Sep 28, 2026", "Sep 1 – Sep 28, 2026". */
  dateLabel: string | null;
  campaignsCount: number;
  /** Unique measure/initiative IDs across the jobs behind verified shifts. */
  initiativesCount: number;
  shiftsCount: number;
  activeHours: number;
  doorsAttempted: number;
  contacts: number;
  signaturesSubmitted: number;
  signaturesReviewed: number;
  signaturesAccepted: number;
  signaturesRejected: number;
  averages: {
    doorsPerActiveHour: MetricExplanation;
    doorsPerCompletedShift: MetricExplanation;
    contactRate: MetricExplanation;
    signaturesPerActiveHour: MetricExplanation;
    acceptanceRate: MetricExplanation;
  };
  verificationBreakdown: {
    verifiedShifts: number;
    pendingReviewShifts: number;
    rejectedShifts: number;
    incompleteShifts: number;
  };
  correctionsApplied: number;
  correctionsIgnored: number;
}

export interface Scorecard {
  period: Period;
  filters: { workType: WorkType | null; state: string | null };
  segments: ScorecardSegment[];
  reliability: { showRate: MetricExplanation };
  /** Newest underlying work event, or null when there are none. */
  lastUpdated: string | null;
  computedAt: string;
}

export interface ScorecardOptions {
  now?: Date;
  period?: Period;
  workType?: WorkType | null;
  state?: string | null;
}

const ACCEPTED_ENGAGEMENT = new Set(["CLAIMED", "ACTIVE", "COMPLETED", "CANCELLED"]);

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}


function latest<T extends { createdAt: Date }>(xs: T[]): T | undefined {
  return xs.reduce<T | undefined>((a, b) => (!a || b.createdAt >= a.createdAt ? b : a), undefined);
}

export { effectiveEvents } from "@/lib/corrections";

type Verification = "verified" | "pending" | "rejected" | "incomplete";

interface ShiftFacts {
  shift: ScorecardShift;
  started: boolean;
  /** Checked in and out (out after in). */
  completed: boolean;
  /** A valid supervisor batch count exists. */
  batchCounted: boolean;
  verification: Verification;
  activeMs: number;
  doors: number;
  contacts: number;
  submitted: number;
  reviewed: number;
  accepted: number;
  rejected: number;
  lastEventAt: Date | null;
  correctionsApplied: number;
  correctionsIgnored: number;
}

function shiftFacts(shift: ScorecardShift): ShiftFacts {
  const { events, applied, ignored } = effectiveEvents(shift.events, shift.validations);
  const f: ShiftFacts = {
    shift,
    started: false,
    completed: false,
    batchCounted: false,
    verification: "incomplete",
    activeMs: 0,
    doors: 0,
    contacts: 0,
    submitted: 0,
    reviewed: 0,
    accepted: 0,
    rejected: 0,
    // Turf marks (NOTE) aren't work: they don't move "last updated".
    lastEventAt: latest(shift.events.filter((e) => e.type !== "NOTE"))?.createdAt ?? null,
    correctionsApplied: applied,
    correctionsIgnored: ignored,
  };

  let checkIn: Date | null = null;
  let checkOut: Date | null = null;
  const pauses: Array<{ start: Date; end: Date | null }> = [];
  for (const e of events) {
    const p = obj(e.payload);
    const count = num(p.count) ?? 1;
    switch (e.type) {
      case "CHECK_IN":
        if (!checkIn) checkIn = e.createdAt;
        break;
      case "CHECK_OUT":
        checkOut = e.createdAt; // last check-out wins
        break;
      case "PAUSE_START":
        pauses.push({ start: e.createdAt, end: null });
        break;
      case "PAUSE_END": {
        const open = pauses.find((x) => x.end === null);
        if (open) open.end = e.createdAt;
        break;
      }
      case "DOOR_KNOCK":
        f.doors += count;
        break;
      case "CONTACT":
        f.contacts += count;
        break;
      case "SIGNATURE_SUBMITTED":
        f.submitted += count;
        break;
      case "BATCH_COUNT": {
        const accepted = num(p.accepted);
        const rejected = num(p.rejected);
        const reviewed = num(p.reviewed) ?? (accepted !== null && rejected !== null ? accepted + rejected : null);
        if (reviewed !== null && accepted !== null) {
          // Events are in time order, so the last valid count wins.
          f.reviewed = reviewed;
          f.accepted = accepted;
          f.rejected = rejected ?? reviewed - accepted;
          f.batchCounted = true;
        }
        break;
      }
    }
  }

  f.started = checkIn !== null;
  const completed = checkIn !== null && checkOut !== null && checkOut > checkIn;
  f.completed = completed;
  if (completed) {
    // Clip pauses to the shift window; an unclosed pause runs to check-out.
    const clipped = pauses.map((x) => ({
      start: new Date(Math.max(x.start.getTime(), checkIn!.getTime())),
      end: new Date(Math.min((x.end ?? checkOut!).getTime(), checkOut!.getTime())),
    }));
    f.activeMs = activeHours(checkIn!, checkOut!, clipped) * 3_600_000;
  }

  const closeout = latest(shift.validations.filter((v) => v.workEventId === null));
  if (closeout?.status === "REJECTED") f.verification = "rejected";
  else if (!completed) f.verification = "incomplete";
  else if (closeout?.status === "APPROVED") f.verification = "verified";
  else f.verification = "pending";
  return f;
}

/**
 * What review verified on one shift, with rejected events dropped and
 * signed corrections applied — the numbers pay is calculated from
 * (lib/pay.ts). Same rules as the scorecard.
 */
export function verifiedWork(
  events: ScorecardEvent[],
  validations: ScorecardValidation[]
): { completed: boolean; activeMs: number; submitted: number; reviewed: number; accepted: number; doors: number; contacts: number; batchCounted: boolean } {
  const f = shiftFacts({ events, validations } as ScorecardShift);
  return {
    completed: f.completed,
    activeMs: f.activeMs,
    submitted: f.submitted,
    reviewed: f.reviewed,
    accepted: f.accepted,
    doors: f.doors,
    contacts: f.contacts,
    batchCounted: f.batchCounted,
  };
}

function round(v: number, places = 4): number {
  const m = 10 ** places;
  return Math.round(v * m) / m;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

const fmtDay = (d: string, year: boolean) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });

/**
 * A human date range: "Sep 28, 2026", "Sep 1 – Sep 28, 2026",
 * "Dec 30, 2025 – Jan 2, 2026". Plain dates only — the server doesn't know
 * the viewer's day, so no "today"/"yesterday". Inputs are YYYY-MM-DD.
 */
export function rangeLabel(from: string, to: string): string {
  if (from === to) return fmtDay(from, true);
  return from.slice(0, 4) === to.slice(0, 4) ? `${fmtDay(from, false)} – ${fmtDay(to, true)}` : `${fmtDay(from, true)} – ${fmtDay(to, true)}`;
}

/** The same range inside a sentence: "on Sep 28, 2026", "from Sep 1 to Sep 28, 2026". */
export function rangePhrase(from: string, to: string): string {
  if (from === to) return `on ${fmtDay(from, true)}`;
  return `from ${fmtDay(from, from.slice(0, 4) !== to.slice(0, 4))} to ${fmtDay(to, true)}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function explain(
  value: number | null,
  numerator: number,
  denominator: number,
  formula: string,
  evidence: string
): MetricExplanation {
  return { value, numerator, denominator: round(denominator), formula, evidence };
}

function segment(
  workType: WorkType,
  period: Period,
  state: string | null,
  facts: ShiftFacts[]
): ScorecardSegment {
  const verified = facts.filter((f) => f.verification === "verified");
  const sum = (pick: (f: ShiftFacts) => number, xs = verified) => xs.reduce((a, f) => a + pick(f), 0);
  const activeMs = sum((f) => f.activeMs);
  const hours = round(activeMs / 3_600_000);
  const doors = sum((f) => f.doors);
  const contacts = sum((f) => f.contacts);
  const submitted = sum((f) => f.submitted);
  const reviewed = sum((f) => f.reviewed);
  const accepted = sum((f) => f.accepted);
  const rejected = sum((f) => f.rejected);
  const doorShifts = verified.filter((f) => f.doors > 0).length;
  const statesWorked = [...new Set(verified.map((f) => f.shift.state))].sort();
  const starts = verified.map((f) => f.shift.startsAt.getTime());
  const dateRange = starts.length
    ? { from: day(new Date(Math.min(...starts))), to: day(new Date(Math.max(...starts))) }
    : null;

  const totals: ShiftTotals = {
    activeMs,
    doorsAttempted: doors,
    contacts,
    signaturesSubmitted: submitted,
    signaturesReviewed: reviewed,
    signaturesAccepted: accepted,
    doorShiftsCompleted: doorShifts,
    shiftsStarted: 0,
    shiftsAccepted: 0,
  };

  const n = verified.length;
  const dateLabel = dateRange ? rangeLabel(dateRange.from, dateRange.to) : null;
  const context =
    plural(n, "verified shift") +
    (dateRange ? ` ${rangePhrase(dateRange.from, dateRange.to)}` : "") +
    (statesWorked.length ? `, ${statesWorked.join("/")}` : "");
  const isPetition = workType === "PETITION";

  return {
    workType,
    period,
    state,
    statesWorked,
    dateRange,
    dateLabel,
    campaignsCount: new Set(verified.map((f) => f.shift.engagementId)).size,
    initiativesCount: new Set(verified.flatMap((f) => f.shift.measureIds ?? [])).size,
    shiftsCount: n,
    activeHours: hours,
    doorsAttempted: doors,
    contacts,
    signaturesSubmitted: submitted,
    signaturesReviewed: reviewed,
    signaturesAccepted: accepted,
    signaturesRejected: rejected,
    averages: {
      // Petition shifts can't log doors, so their zero isn't a measurement.
      doorsPerActiveHour:
        isPetition && doors === 0
          ? explain(null, 0, 0, "verified doors attempted ÷ verified active field hours", "No doors are logged on petition shifts.")
          : explain(
              doorsPerActiveHour(totals),
              doors,
              hours,
              "verified doors attempted ÷ verified active field hours",
              `${doors} doors over ${hours} active hours (paused time excluded); ${context}`
            ),
      doorsPerCompletedShift: explain(
        doorsPerCompletedShift(totals),
        doors,
        doorShifts,
        "verified doors attempted ÷ completed door shifts",
        `${doors} doors across ${plural(doorShifts, "completed shift")} with door attempts; ${context}`
      ),
      contactRate: explain(
        contactRate(totals),
        contacts,
        doors,
        "resident contacts ÷ doors attempted",
        `${contacts} contacts from ${doors} doors; ${context}`
      ),
      signaturesPerActiveHour: isPetition
        ? explain(
            signaturesPerActiveHour(totals),
            submitted,
            hours,
            "submitted signatures ÷ verified petition hours",
            `${submitted} signatures over ${hours} petition hours (paused time excluded); ${context}`
          )
        : explain(null, 0, 0, "submitted signatures ÷ verified petition hours", "Only computed for petition work."),
      acceptanceRate: explain(
        acceptanceRate(totals),
        accepted,
        reviewed,
        "accepted signatures ÷ signatures reviewed",
        `${accepted} accepted of ${reviewed} reviewed (${rejected} rejected); ${context}`
      ),
    },
    verificationBreakdown: {
      verifiedShifts: n,
      pendingReviewShifts: facts.filter((f) => f.verification === "pending").length,
      rejectedShifts: facts.filter((f) => f.verification === "rejected").length,
      incompleteShifts: facts.filter((f) => f.verification === "incomplete").length,
    },
    correctionsApplied: sum((f) => f.correctionsApplied, facts),
    correctionsIgnored: sum((f) => f.correctionsIgnored, facts),
  };
}

/**
 * Verified work per campaign, newest first — the same verification rules as
 * the scorecard totals, so the list always adds up to them.
 */
export function campaignHistory(shifts: ScorecardShift[], limit = 5): CampaignHistory[] {
  const by = new Map<string, CampaignHistory>();
  for (const s of shifts) {
    if (!s.jobId) continue;
    const f = shiftFacts(s);
    if (f.verification !== "verified") continue;
    const h = by.get(s.jobId) ?? { jobId: s.jobId, title: s.jobTitle ?? "Campaign", workType: s.workType, verifiedShifts: 0, accepted: 0, reviewed: 0, doors: 0, lastAt: s.startsAt.toISOString() };
    h.verifiedShifts += 1;
    h.accepted += f.accepted;
    h.reviewed += f.reviewed;
    h.doors += f.doors;
    if (s.startsAt.toISOString() > h.lastAt) h.lastAt = s.startsAt.toISOString();
    by.set(s.jobId, h);
  }
  return [...by.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, limit);
}

/**
 * How a shift was cancelled, from its newest SHIFT_CANCELLED event:
 * - "late" = by the worker inside the job's notice window — or by anyone
 *   after the shift ended, when it was already a no-show;
 * - "excused" = by the worker in time, or by the organization before the
 *   end;
 * - null = not cancelled by event.
 * A shift scheduled with less notice than the window gives the worker until
 * it starts (or an hour after it was scheduled, if later) to cancel: the
 * worker can't owe notice the organization didn't give.
 */
export function cancellationOf(shift: ScorecardShift): "late" | "excused" | null {
  const { events } = effectiveEvents(shift.events, shift.validations);
  const c = latest(events.filter((e) => e.type === "SHIFT_CANCELLED"));
  if (!c) return null;
  const at = c.createdAt.getTime();
  if (at > shift.endsAt.getTime()) return "late";
  if (obj(c.payload).by !== "WORKER") return "excused";
  const start = shift.startsAt.getTime();
  const noticeDeadline = start - (shift.cancellationNoticeHours ?? 24) * 3_600_000;
  const scheduled = shift.scheduledAt.getTime();
  const deadline = scheduled > noticeDeadline ? Math.max(start, scheduled + 3_600_000) : noticeDeadline;
  return at > deadline ? "late" : "excused";
}

export function computeScorecard(shifts: ScorecardShift[], opts: ScorecardOptions = {}): Scorecard {
  const now = opts.now ?? new Date();
  const period = opts.period ?? "lifetime";
  const days = PERIOD_DAYS[period];
  const since = days === null ? null : now.getTime() - days * 86_400_000;

  const inScope = shifts.filter(
    (s) =>
      ACCEPTED_ENGAGEMENT.has(s.engagementStatus) &&
      s.startsAt.getTime() <= now.getTime() &&
      (since === null || s.startsAt.getTime() >= since) &&
      (!opts.workType || s.workType === opts.workType) &&
      (!opts.state || s.state === opts.state)
  );
  const all = inScope.map((s) => ({ s, cancellation: cancellationOf(s) }));
  // Cancelled shifts produce no work, so they stay out of the segments.
  const facts = all.filter((x) => !x.cancellation && x.s.status !== "CANCELLED").map((x) => shiftFacts(x.s));

  const workTypes = (["PETITION", "CANVASS"] as const).filter((w) => facts.some((f) => f.shift.workType === w));
  const segments = workTypes.map((w) =>
    segment(w, period, opts.state ?? null, facts.filter((f) => f.shift.workType === w))
  );

  // Reliability spans every work type in scope (spec p.10: started accepted
  // shifts ÷ accepted shifts not timely cancelled).
  // - A worker cancellation inside the job's notice window still counts as an
  //   accepted shift that wasn't started — a no-show.
  // - A timely worker cancellation, or any organization cancellation, leaves
  //   the denominator.
  // - A legacy CANCELLED shift with no SHIFT_CANCELLED event is treated as
  //   excused: there's no record of who cancelled or when.
  // - A shift nobody has started yet isn't a no-show until it has ended.
  const late = all.filter((x) => x.cancellation === "late").length;
  const excused = all.filter((x) => x.cancellation === "excused" || (!x.cancellation && x.s.status === "CANCELLED")).length;
  const due = facts.filter((f) => f.started || f.shift.endsAt.getTime() <= now.getTime());
  const started = due.filter((f) => f.started).length;
  const acceptedDue = due.length + late;
  const rel: ShiftTotals = {
    activeMs: 0,
    doorsAttempted: 0,
    contacts: 0,
    signaturesSubmitted: 0,
    signaturesReviewed: 0,
    signaturesAccepted: 0,
    doorShiftsCompleted: 0,
    shiftsStarted: started,
    shiftsAccepted: acceptedDue,
  };

  const lastEvent = facts
    .map((f) => f.lastEventAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return {
    period,
    filters: { workType: opts.workType ?? null, state: opts.state ?? null },
    segments,
    reliability: {
      showRate: explain(
        showRate(rel),
        started,
        acceptedDue,
        "started accepted shifts ÷ accepted shifts not timely cancelled",
        `started ${started} of ${plural(acceptedDue, "accepted shift")} due so far` +
          (late ? `; ${plural(late, "late cancellation")} by the worker counted as no-shows` : "") +
          (excused ? `; ${plural(excused, "timely or organization cancellation")} left out` : "")
      ),
    },
    lastUpdated: lastEvent ? lastEvent.toISOString() : null,
    computedAt: now.toISOString(),
  };
}
