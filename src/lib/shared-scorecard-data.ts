import { loadScorecard, loadScorecardPeriods } from "@/lib/scorecard-data";
import { shareScorecard, shareScorecardPeriodsForOrg, type SharedScorecard } from "@/lib/shared-scorecard";
import { loadSharing, orgViewer } from "@/lib/sharing-data";
import { visibleParts } from "@/lib/sharing";
import type { Period, ScorecardOptions } from "@/lib/scorecard";

/** What an organization's staff may see of a worker's parts, right now. */
export async function partsForOrg(workerId: string, orgId: string) {
  const [sharing, viewer] = await Promise.all([loadSharing(workerId), orgViewer(workerId, orgId)]);
  return visibleParts(sharing.choices, viewer);
}

/**
 * A worker's scorecard as one organization may see it — the live view. Every
 * organization screen and API reads worker numbers through these two.
 */
export async function loadOrgScorecardPeriods(workerId: string, orgId: string): Promise<Record<Period, SharedScorecard>> {
  const [periods, parts] = await Promise.all([loadScorecardPeriods(workerId), partsForOrg(workerId, orgId)]);
  return shareScorecardPeriodsForOrg(periods, parts);
}

/**
 * Period and state filters are part of hours and history: without it, the
 * organization gets the lifetime view across all states, so filtering can't
 * reveal where or when the worker worked.
 */
export async function loadOrgScorecard(workerId: string, orgId: string, opts: ScorecardOptions = {}): Promise<SharedScorecard> {
  const parts = await partsForOrg(workerId, orgId);
  const allowed = parts.history ? opts : { ...opts, period: "lifetime" as const, state: null };
  return shareScorecard(await loadScorecard(workerId, allowed), parts);
}
