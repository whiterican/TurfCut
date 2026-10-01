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
 *   .rejected (reviewed defaults to accepted + rejected).
 * - CORRECTION: payload.supersedesEventId + corrected fields, and must carry
 *   payload.signedBy and payload.reason. Unsigned or unexplained corrections
 *   are ignored (and counted). The newest valid correction wins; the original
 *   row is never touched.
 * - An event whose latest event-level validation is REJECTED is excluded.
 */
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
  events: ScorecardEvent[];
  validations: ScorecardValidation[];
  /** The job's notice window: a worker cancellation later than this is a no-show. Default 24. */
  cancellationNoticeHours?: number;
  /** The job's ballot measure / initiative IDs. */
  measureIds?: string[];
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

const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;

function latest<T extends { createdAt: Date }>(xs: T[]): T | undefined {
  return xs.reduce<T | undefined>((a, b) => (!a || b.createdAt >= a.createdAt ? b : a), undefined);
}

/**
 * Drops rejected events and applies valid (signed, explained) corrections:
 * newest valid correction per target wins.
 */
export function effectiveEvents(
  events: ScorecardEvent[],
  validations: ScorecardValidation[] = []
): { events: ScorecardEvent[]; applied: number; ignored: number } {
  const rejected = new Set<string>();
  const byEvent = new Map<string, ScorecardValidation[]>();
  for (const v of validations) {
    if (!v.workEventId) continue;
    byEvent.set(v.workEventId, [...(byEvent.get(v.workEventId) ?? []), v]);
  }
  for (const [id, vs] of byEvent) if (latest(vs)?.status === "REJECTED") rejected.add(id);

  const sorted = [...events]
    .filter((e) => !rejected.has(e.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const corrections = new Map<string, Record<string, unknown>>();
  let ignored = 0;
  for (const e of sorted) {
    if (e.type !== "CORRECTION") continue;
    const p = obj(e.payload);
    if (nonEmpty(p.supersedesEventId) && nonEmpty(p.signedBy) && nonEmpty(p.reason)) {
      corrections.set(p.supersedesEventId as string, p);
    } else {
      ignored++;
    }
  }
  let applied = 0;
  const out = sorted
    .filter((e) => e.type !== "CORRECTION")
    .map((e) => {
      const c = corrections.get(e.id);
      if (!c) return e;
      applied++;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { supersedesEventId, signedBy, reason, ...fields } = c;
      return { ...e, payload: { ...obj(e.payload), ...fields } };
    });
  return { events: out, applied, ignored };
}

type Verification = "verified" | "pending" | "rejected" | "incomplete";

interface ShiftFacts {
  shift: ScorecardShift;
  started: boolean;
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
    verification: "incomplete",
    activeMs: 0,
    doors: 0,
    contacts: 0,
    submitted: 0,
    reviewed: 0,
    accepted: 0,
    rejected: 0,
    lastEventAt: latest(shift.events)?.createdAt ?? null,
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
          f.reviewed += reviewed;
          f.accepted += accepted;
          f.rejected += rejected ?? reviewed - accepted;
        }
        break;
      }
    }
  }

  f.started = checkIn !== null;
  const completed = checkIn !== null && checkOut !== null && checkOut > checkIn;
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

function round(v: number, places = 4): number {
  const m = 10 ** places;
  return Math.round(v * m) / m;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

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
  const context =
    `${n} verified shift(s)` +
    (dateRange ? `, ${dateRange.from} to ${dateRange.to}` : "") +
    (statesWorked.length ? `, ${statesWorked.join("/")}` : "");
  const isPetition = workType === "PETITION";

  return {
    workType,
    period,
    state,
    statesWorked,
    dateRange,
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
      doorsPerActiveHour: explain(
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
        `${doors} doors across ${doorShifts} completed shift(s) with door attempts; ${context}`
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
 * How a shift was cancelled, from its newest SHIFT_CANCELLED event:
 * "late" = by the worker inside the job's notice window; "excused" = by the
 * worker in time, or by the organization; null = not cancelled by event.
 */
export function cancellationOf(shift: ScorecardShift): "late" | "excused" | null {
  const { events } = effectiveEvents(shift.events, shift.validations);
  const c = latest(events.filter((e) => e.type === "SHIFT_CANCELLED"));
  if (!c) return null;
  if (obj(c.payload).by !== "WORKER") return "excused";
  const noticeMs = (shift.cancellationNoticeHours ?? 24) * 3_600_000;
  return c.createdAt.getTime() > shift.startsAt.getTime() - noticeMs ? "late" : "excused";
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
  const late = all.filter((x) => x.cancellation === "late").length;
  const excused = all.filter((x) => x.cancellation === "excused" || (!x.cancellation && x.s.status === "CANCELLED")).length;
  const started = facts.filter((f) => f.started).length;
  const acceptedDue = facts.length + late;
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
        `started ${started} of ${acceptedDue} accepted shift(s) due so far` +
          (late ? `; ${late} late cancellation(s) by the worker counted as no-shows` : "") +
          (excused ? `; ${excused} timely or organization cancellation(s) left out` : "")
      ),
    },
    lastUpdated: lastEvent ? lastEvent.toISOString() : null,
    computedAt: now.toISOString(),
  };
}
