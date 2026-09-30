import { db } from "@/lib/db";
import { computeScorecard, type Scorecard } from "@/lib/scorecard";

/**
 * Loads every shift the worker was engaged on, with its work events, and
 * derives the scorecard. Reads work_events only — never ProfileMetric — so the
 * numbers can't drift from the ledger or be hand-edited.
 */
export async function loadScorecard(workerId: string): Promise<Scorecard> {
  const shifts = await db().shift.findMany({
    where: { engagement: { workerId } },
    select: {
      id: true,
      status: true,
      startsAt: true,
      events: {
        select: { id: true, type: true, payload: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return computeScorecard(shifts);
}
