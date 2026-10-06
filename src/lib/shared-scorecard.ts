/**
 * The one view of a worker's scorecard for anyone but the worker (C2.3).
 * Pure. Every organization screen, API response and hiring snapshot reads a
 * worker's numbers through shareScorecard(); the worker's own Profile uses it
 * too, with everything shared, so both draw from the same shape.
 *
 * - A withheld group is null — shown as "not shared", never as a zero, and
 *   never ranked (sortWithWithheld puts those workers in their own group).
 * - A shared rate keeps its formula. Its counts (numerator, denominator and
 *   the evidence built from them: doors, hours, signatures, shifts) and its
 *   context (dates, states) are hours and history, so without that group the
 *   rate shows its value and formula only — and a rate with no data yet is
 *   withheld too, since "none yet" says the worker has no such work.
 * - Work types stay visible: they say what kind of work the numbers are for.
 */
import type { MetricExplanation, Period, Scorecard, ScorecardSegment } from "@/lib/scorecard";
import { METRIC_GROUP, SHARE_GROUPS, type ShareGroup, type SharePart } from "@/lib/sharing";

export type AverageKey = keyof ScorecardSegment["averages"];
export const AVERAGE_KEYS: AverageKey[] = ["doorsPerActiveHour", "doorsPerCompletedShift", "contactRate", "signaturesPerActiveHour", "acceptanceRate"];

export interface SharedHistory {
  statesWorked: string[];
  dateLabel: string | null;
  campaignsCount: number;
  initiativesCount: number;
  shiftsCount: number;
  activeHours: number;
  doorsAttempted: number;
  signaturesSubmitted: number;
  signaturesReviewed: number;
  signaturesAccepted: number;
  verificationBreakdown: ScorecardSegment["verificationBreakdown"];
  correctionsApplied: number;
}

/** A shared rate. Counts are null when hours and history aren't shared. */
export interface SharedMetric {
  value: number | null;
  formula: string;
  numerator: number | null;
  denominator: number | null;
  evidence: string;
}

export interface SharedSegment {
  workType: ScorecardSegment["workType"];
  /** null = the worker doesn't share hours and history with this viewer. */
  history: SharedHistory | null;
  /** Each average, or null when its group isn't shared. */
  averages: Record<AverageKey, SharedMetric | null>;
}

export interface SharedScorecard {
  period: Period;
  shared: Record<ShareGroup, boolean>;
  segments: SharedSegment[];
  /** null = reliability isn't shared. */
  showRate: SharedMetric | null;
  /** When the underlying work was last recorded; part of history. */
  lastUpdated: string | null;
}

export const ALL_SHARED: Record<SharePart, boolean> = {
  output: true, quality: true, reliability: true, history: true, availability: true, credentials: true,
};

const groupsOf = (parts: Record<SharePart, boolean>): Record<ShareGroup, boolean> =>
  Object.fromEntries(SHARE_GROUPS.map((g) => [g, parts[g] === true])) as Record<ShareGroup, boolean>;

/** Rates under 1 (percentages) to whole percents; others to one decimal. */
export const roundWithoutCounts = (v: number) => (v <= 1 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10);

export const COUNTS_WITHHELD = "The counts behind this rate are part of hours and history, which the worker doesn't share.";

function metric(m: MetricExplanation, history: boolean): SharedMetric | null {
  if (history) return { value: m.value, formula: m.formula, numerator: m.numerator, denominator: m.denominator, evidence: m.evidence };
  if (m.value === null) return null;
  // Rounded, so an exact value can't be worked back to its counts (0.9090… = 10/11).
  return { value: roundWithoutCounts(m.value), formula: m.formula, numerator: null, denominator: null, evidence: COUNTS_WITHHELD };
}

export function shareScorecard(sc: Scorecard, parts: Record<SharePart, boolean>): SharedScorecard {
  const shared = groupsOf(parts);
  return {
    period: sc.period,
    shared,
    segments: sc.segments.map((seg) => ({
      workType: seg.workType,
      history: shared.history
        ? {
            statesWorked: seg.statesWorked,
            dateLabel: seg.dateLabel,
            campaignsCount: seg.campaignsCount,
            initiativesCount: seg.initiativesCount,
            shiftsCount: seg.shiftsCount,
            activeHours: seg.activeHours,
            doorsAttempted: seg.doorsAttempted,
            signaturesSubmitted: seg.signaturesSubmitted,
            signaturesReviewed: seg.signaturesReviewed,
            signaturesAccepted: seg.signaturesAccepted,
            verificationBreakdown: seg.verificationBreakdown,
            correctionsApplied: seg.correctionsApplied,
          }
        : null,
      averages: Object.fromEntries(
        AVERAGE_KEYS.map((k) => [k, shared[METRIC_GROUP[k]] ? metric(seg.averages[k], shared.history) : null])
      ) as Record<AverageKey, SharedMetric | null>,
    })),
    showRate: shared.reliability ? metric(sc.reliability.showRate, shared.history) : null,
    lastUpdated: shared.history ? sc.lastUpdated : null,
  };
}

export function shareScorecardPeriods(
  periods: Record<Period, Scorecard>,
  parts: Record<SharePart, boolean>
): Record<Period, SharedScorecard> {
  return {
    lifetime: shareScorecard(periods.lifetime, parts),
    "12m": shareScorecard(periods["12m"], parts),
    "90d": shareScorecard(periods["90d"], parts),
  };
}

/**
 * The sort rule for lists of workers (used by C3's Applicants and Matches):
 * workers who share the metric are sorted by it; workers who withheld it sit
 * in their own group below, in their original order — never ranked as zero.
 * Workers who share it but have no data yet come after those with data.
 */
export function sortWithWithheld<T>(
  rows: T[],
  valueOf: (row: T) => number | null | "withheld",
  direction: "desc" | "asc" = "desc"
): { sorted: T[]; noData: T[]; withheld: T[] } {
  const sorted: Array<{ row: T; v: number; i: number }> = [];
  const noData: T[] = [];
  const withheld: T[] = [];
  rows.forEach((row, i) => {
    const v = valueOf(row);
    if (v === "withheld") withheld.push(row);
    else if (v === null || Number.isNaN(v)) noData.push(row);
    else sorted.push({ row, v, i });
  });
  sorted.sort((a, b) => (direction === "desc" ? b.v - a.v : a.v - b.v) || a.i - b.i);
  // (NaN never reaches here: it's filed with no-data below.)
  return { sorted: sorted.map((x) => x.row), noData, withheld };
}
