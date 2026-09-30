/**
 * Worker scorecard, derived from append-only work events.
 *
 * Rules (CLAUDE.md + M1 spec):
 * - Every number comes from work_events. Nothing here reads a stored metric,
 *   and nothing is hand-editable.
 * - Active time excludes paused time.
 * - No composite or universal score. Each metric is reported on its own with
 *   the numerator, denominator, and evidence behind it.
 *
 * Event conventions:
 * - DOOR_KNOCK / CONTACT / SIGNATURE_SUBMITTED: payload.count (default 1).
 * - BATCH_COUNT: supervisor reconciliation, payload.accepted (and optionally
 *   payload.submitted; falls back to the shift's SIGNATURE_SUBMITTED total).
 * - CORRECTION: payload.supersedesEventId + the corrected fields. The newest
 *   correction for an event wins; the original row is never touched.
 * - Active time needs both CHECK_IN and CHECK_OUT. A shift without both is not
 *   counted toward per-hour rates (numerator or denominator), so a missing
 *   check-out can't inflate or deflate a rate.
 *
 * Shift schedule data (status, startsAt) is used only for the show-rate
 * denominator: "shifts the worker was due to work".
 */
import {
  acceptanceRate,
  activeHours,
  contactRate,
  doorsPerActiveHour,
  doorsPerCompletedShift,
  showRate,
  signaturesPerActiveHour,
} from "@/lib/metrics";

export type ScorecardEventType =
  | "CHECK_IN"
  | "CHECK_OUT"
  | "PAUSE_START"
  | "PAUSE_END"
  | "DOOR_KNOCK"
  | "CONTACT"
  | "SIGNATURE_SUBMITTED"
  | "BATCH_COUNT"
  | "CORRECTION"
  | (string & {});

export interface ScorecardEvent {
  id: string;
  type: ScorecardEventType;
  payload: unknown;
  createdAt: Date;
}

export interface ScorecardShift {
  id: string;
  status: "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startsAt: Date;
  events: ScorecardEvent[];
}

export interface MetricExplanation {
  value: number | null;
  numerator: number;
  denominator: number;
  formula: string;
  evidence: string;
}

export interface Scorecard {
  metrics: {
    doorsPerActiveHour: MetricExplanation;
    doorsPerCompletedShift: MetricExplanation;
    contactRate: MetricExplanation;
    signaturesPerActiveHour: MetricExplanation;
    acceptanceRate: MetricExplanation;
    showRate: MetricExplanation;
  };
  totals: {
    activeHours: number;
    pausedHours: number;
    doorsKnocked: number;
    contacts: number;
    signaturesSubmitted: number;
    signaturesAccepted: number;
    shiftsDue: number;
    shiftsCheckedIn: number;
    shiftsCompleted: number;
    shiftsReconciled: number;
  };
  eventCount: number;
  computedAt: string;
}

interface ShiftFacts {
  checkedIn: boolean;
  completed: boolean;
  activeMs: number;
  pausedMs: number;
  doors: number;
  contacts: number;
  signatures: number;
  reconciled: boolean;
  accepted: number;
  reconciledSubmitted: number;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/** Applies CORRECTION events: newest correction per target wins. */
export function applyCorrections(events: ScorecardEvent[]): ScorecardEvent[] {
  const byTime = [...events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const latest = new Map<string, Record<string, unknown>>();
  for (const e of byTime) {
    if (e.type !== "CORRECTION") continue;
    const p = obj(e.payload);
    if (typeof p.supersedesEventId === "string") {
      latest.set(p.supersedesEventId, p);
    }
  }
  return byTime
    .filter((e) => e.type !== "CORRECTION")
    .map((e) => {
      const c = latest.get(e.id);
      if (!c) return e;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { supersedesEventId, ...fields } = c;
      return { ...e, payload: { ...obj(e.payload), ...fields } };
    });
}

function shiftFacts(shift: ScorecardShift): ShiftFacts {
  const events = applyCorrections(shift.events);
  const f: ShiftFacts = {
    checkedIn: false,
    completed: false,
    activeMs: 0,
    pausedMs: 0,
    doors: 0,
    contacts: 0,
    signatures: 0,
    reconciled: false,
    accepted: 0,
    reconciledSubmitted: 0,
  };

  let checkIn: Date | null = null;
  let checkOut: Date | null = null;
  const pauses: Array<{ start: Date; end: Date | null }> = [];
  let batchSubmitted: number | null = null;

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
        f.signatures += count;
        break;
      case "BATCH_COUNT": {
        const accepted = num(p.accepted);
        if (accepted !== null) {
          f.reconciled = true;
          f.accepted += accepted;
          const s = num(p.submitted);
          if (s !== null) batchSubmitted = (batchSubmitted ?? 0) + s;
        }
        break;
      }
    }
  }

  f.checkedIn = checkIn !== null;
  if (checkIn && checkOut && checkOut > checkIn) {
    f.completed = true;
    // Clip pauses to the shift window; an unclosed pause runs to check-out.
    const clipped = pauses.map((x) => ({
      start: new Date(Math.max(x.start.getTime(), checkIn!.getTime())),
      end: new Date(Math.min((x.end ?? checkOut!).getTime(), checkOut!.getTime())),
    }));
    const hours = activeHours(checkIn, checkOut, clipped);
    f.activeMs = hours * 3_600_000;
    f.pausedMs = checkOut.getTime() - checkIn.getTime() - f.activeMs;
  }
  if (f.reconciled) f.reconciledSubmitted = batchSubmitted ?? f.signatures;
  return f;
}

export function computeScorecard(
  shifts: ScorecardShift[],
  now: Date = new Date()
): Scorecard {
  const due = shifts.filter(
    (s) => s.status !== "CANCELLED" && s.startsAt.getTime() <= now.getTime()
  );
  const facts = due.map(shiftFacts);
  const sum = (pick: (f: ShiftFacts) => number, only = facts) =>
    only.reduce((acc, f) => acc + pick(f), 0);

  const completed = facts.filter((f) => f.completed);
  const reconciled = facts.filter((f) => f.reconciled);
  const activeMs = sum((f) => f.activeMs, completed);
  const hours = activeMs / 3_600_000;

  const doorsAll = sum((f) => f.doors);
  const contactsAll = sum((f) => f.contacts);
  const doorsTimed = sum((f) => f.doors, completed);
  const sigsTimed = sum((f) => f.signatures, completed);
  const accepted = sum((f) => f.accepted, reconciled);
  const reconciledSubmitted = sum((f) => f.reconciledSubmitted, reconciled);
  const checkedIn = facts.filter((f) => f.checkedIn).length;

  const h = round(hours, 4);
  const n = completed.length;

  return {
    metrics: {
      doorsPerActiveHour: {
        value: doorsPerActiveHour({ ...zero, activeMs, doorsKnocked: doorsTimed }),
        numerator: doorsTimed,
        denominator: h,
        formula: "doors knocked ÷ active hours",
        evidence: `${doorsTimed} doors over ${h} active hours (paused time excluded) across ${n} completed shift(s)`,
      },
      doorsPerCompletedShift: {
        value: doorsPerCompletedShift({ ...zero, doorsKnocked: doorsTimed, shiftsCompleted: n }),
        numerator: doorsTimed,
        denominator: n,
        formula: "doors knocked on completed shifts ÷ completed shifts",
        evidence: `${doorsTimed} doors across ${n} shift(s) with both check-in and check-out`,
      },
      contactRate: {
        value: contactRate({ ...zero, doorsKnocked: doorsAll, contacts: contactsAll }),
        numerator: contactsAll,
        denominator: doorsAll,
        formula: "contacts ÷ doors knocked",
        evidence: `${contactsAll} contacts from ${doorsAll} doors`,
      },
      signaturesPerActiveHour: {
        value: signaturesPerActiveHour({ ...zero, activeMs, signaturesSubmitted: sigsTimed }),
        numerator: sigsTimed,
        denominator: h,
        formula: "signatures submitted ÷ active hours",
        evidence: `${sigsTimed} signatures over ${h} active hours (paused time excluded)`,
      },
      acceptanceRate: {
        value: acceptanceRate({
          ...zero,
          signaturesSubmitted: reconciledSubmitted,
          signaturesAccepted: accepted,
        }),
        numerator: accepted,
        denominator: reconciledSubmitted,
        formula: "signatures accepted ÷ signatures submitted (reconciled shifts only)",
        evidence: `${accepted} of ${reconciledSubmitted} signatures accepted on ${reconciled.length} supervisor-reconciled shift(s)`,
      },
      showRate: {
        value: showRate({ ...zero, shiftsCompleted: checkedIn, shiftsScheduled: due.length }),
        numerator: checkedIn,
        denominator: due.length,
        formula: "shifts checked into ÷ shifts due (scheduled, not cancelled, start time passed)",
        evidence: `checked into ${checkedIn} of ${due.length} due shift(s)`,
      },
    },
    totals: {
      activeHours: h,
      pausedHours: round(sum((f) => f.pausedMs, completed) / 3_600_000, 4),
      doorsKnocked: doorsAll,
      contacts: contactsAll,
      signaturesSubmitted: sum((f) => f.signatures),
      signaturesAccepted: accepted,
      shiftsDue: due.length,
      shiftsCheckedIn: checkedIn,
      shiftsCompleted: n,
      shiftsReconciled: reconciled.length,
    },
    eventCount: due.reduce((acc, s) => acc + s.events.length, 0),
    computedAt: now.toISOString(),
  };
}

const zero = {
  activeMs: 0,
  doorsKnocked: 0,
  contacts: 0,
  signaturesSubmitted: 0,
  signaturesAccepted: 0,
  shiftsCompleted: 0,
  shiftsScheduled: 0,
};

function round(v: number, places: number): number {
  const m = 10 ** places;
  return Math.round(v * m) / m;
}
