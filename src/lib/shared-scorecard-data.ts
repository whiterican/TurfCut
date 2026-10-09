import { loadScorecard, loadScorecardPeriods } from "@/lib/scorecard-data";
import { shareScorecard, shareScorecardPeriodsForOrg, type SharedScorecard } from "@/lib/shared-scorecard";
import { db } from "@/lib/db";
import { RELATIONSHIP_STATUSES } from "@/lib/engagements";
import { loadSharing, orgViewer } from "@/lib/sharing-data";
import { DEFAULT_SHARING, sharingFromRow, visibleParts, type SharePart } from "@/lib/sharing";
import type { Period, ScorecardOptions } from "@/lib/scorecard";

/** What an organization's staff may see of a worker's parts, right now. */
export async function partsForOrg(workerId: string, orgId: string) {
  const [sharing, viewer] = await Promise.all([loadSharing(workerId), orgViewer(workerId, orgId)]);
  return visibleParts(sharing.choices, viewer);
}

/**
 * partsForOrg for a list of workers in four queries, whatever its length
 * (the applicants table). Same rules: each worker's latest sharing choice,
 * the organization's approval, a relationship from the worker's own
 * engagements, closed (or missing) accounts read as the public.
 */
export async function partsForOrgMany(workerIds: string[], orgId: string): Promise<Map<string, Record<SharePart, boolean>>> {
  const ids = [...new Set(workerIds)];
  const out = new Map<string, Record<SharePart, boolean>>();
  if (!ids.length) return out;
  const [org, workers, sharing, related] = await Promise.all([
    db().organization.findUnique({ where: { id: orgId }, select: { approved: true } }),
    db().worker.findMany({ where: { id: { in: ids } }, select: { id: true, closedAt: true } }),
    db().workerSharing.findMany({ where: { workerId: { in: ids } }, orderBy: [{ workerId: "asc" }, { version: "desc" }], distinct: ["workerId"] }),
    db().engagement.groupBy({ by: ["workerId"], where: { workerId: { in: ids }, job: { orgId }, status: { in: RELATIONSHIP_STATUSES } } }),
  ]);
  const open = new Set(workers.filter((w) => !w.closedAt).map((w) => w.id));
  const choices = new Map(sharing.map((r) => [r.workerId, sharingFromRow(r)]));
  const rel = new Set(related.map((r) => r.workerId));
  for (const id of ids) {
    const viewer = open.has(id) ? { kind: "org" as const, approved: org?.approved ?? false, relationship: rel.has(id) } : { kind: "public" as const };
    out.set(id, visibleParts(choices.get(id) ?? DEFAULT_SHARING, viewer));
  }
  return out;
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
