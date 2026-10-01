import { db } from "@/lib/db";
import {
  computeScorecard,
  PERIODS,
  type Period,
  type Scorecard,
  type ScorecardOptions,
  type ScorecardShift,
  type WorkType,
} from "@/lib/scorecard";

/**
 * Loads every shift the worker was engaged on — with its work events,
 * validations, job type and jurisdiction state — as scorecard input. Reads
 * work_events and validations only, never ProfileMetric, so the numbers
 * can't drift from the ledger or be hand-edited.
 */
export async function loadScorecardShifts(workerId: string): Promise<ScorecardShift[]> {
  const shifts = await db().shift.findMany({
    where: { engagement: { workerId } },
    select: {
      id: true,
      status: true,
      startsAt: true,
      engagement: {
        select: {
          id: true,
          status: true,
          job: {
            select: {
              type: true,
              measureIds: true,
              cancellationNoticeHours: true,
              jurisdiction: { select: { state: true } },
            },
          },
        },
      },
      events: {
        select: { id: true, type: true, payload: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      validations: { select: { workEventId: true, status: true, createdAt: true } },
    },
  });
  return shifts.map((s) => ({
    id: s.id,
    engagementId: s.engagement.id,
    engagementStatus: s.engagement.status,
    workType: s.engagement.job.type,
    state: s.engagement.job.jurisdiction.state,
    status: s.status,
    startsAt: s.startsAt,
    events: s.events,
    validations: s.validations,
    cancellationNoticeHours: s.engagement.job.cancellationNoticeHours,
    measureIds: s.engagement.job.measureIds,
  }));
}

export async function loadScorecard(workerId: string, opts: ScorecardOptions = {}): Promise<Scorecard> {
  return computeScorecard(await loadScorecardShifts(workerId), opts);
}

/** Lifetime, last 12 months and last 90 days — the profile's side-by-side view. */
export async function loadScorecardPeriods(workerId: string): Promise<Record<Period, Scorecard>> {
  const shifts = await loadScorecardShifts(workerId);
  const now = new Date();
  return Object.fromEntries(
    PERIODS.map((period) => [period, computeScorecard(shifts, { now, period })])
  ) as Record<Period, Scorecard>;
}

/** Parses ?period=&workType=&state= from the scorecard endpoint. */
export function parseScorecardQuery(
  q: URLSearchParams
): { ok: true; opts: ScorecardOptions } | { ok: false; error: string } {
  const period = q.get("period") ?? "lifetime";
  if (!PERIODS.includes(period as Period)) {
    return { ok: false, error: `period must be one of ${PERIODS.join(", ")}` };
  }
  const workType = q.get("workType");
  if (workType !== null && workType !== "PETITION" && workType !== "CANVASS") {
    return { ok: false, error: "workType must be PETITION or CANVASS" };
  }
  const state = q.get("state");
  if (state !== null && !/^[A-Z]{2}$/.test(state)) {
    return { ok: false, error: "state must be a two-letter code, e.g. CO" };
  }
  return {
    ok: true,
    opts: { period: period as Period, workType: workType as WorkType | null, state },
  };
}
