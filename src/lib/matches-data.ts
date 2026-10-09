import { db } from "@/lib/db";
import { availabilityFromRow, EMPTY_AVAILABILITY } from "@/lib/availability";
import { currentCredentials, orgCredentialView } from "@/lib/credentials";
import { geoTables, milesBetween, resolveArea, type Point } from "@/lib/geo";
import { exclusionReasons, readDisclosure } from "@/lib/jobs";
import { loadLatestPreference } from "@/lib/political-fit-data";
import { computeScorecard } from "@/lib/scorecard";
import { loadScorecard } from "@/lib/scorecard-data";
import { shareScorecard } from "@/lib/shared-scorecard";
import { partsForOrgMany } from "@/lib/shared-scorecard-data";
import type { ApplicantFacts } from "@/lib/applicants";

/** When a findable worker set no travel distance, how far they're matched (said on the page). */
export const DEFAULT_TRAVEL_MILES = 25;

export type MatchRow = ApplicantFacts & {
  workerId: string;
  /** Straight-line miles from the worker's home area to the job's city. */
  miles: number;
  travelMiles: number;
  travelSet: boolean;
};

type MatchJob = {
  id: string;
  orgId: string;
  type: "PETITION" | "CANVASS";
  geography: unknown;
  campaignDisclosure: unknown;
  measureIds: string[];
  org: { name: string; approved: boolean };
  jurisdiction: { state: string };
};

const JOB_SELECT = {
  id: true, orgId: true, type: true, geography: true, campaignDisclosure: true, measureIds: true,
  org: { select: { name: true, approved: true } },
  jurisdiction: { select: { state: true } },
} as const;

/** The job's place: its city in its state, from the bundled Census places. */
export async function jobPoint(job: Pick<MatchJob, "geography" | "jurisdiction">): Promise<Point | null> {
  const g = job.geography && typeof job.geography === "object" ? (job.geography as Record<string, unknown>) : {};
  const city = typeof g.city === "string" ? g.city : null;
  const state = typeof g.state === "string" ? g.state : job.jurisdiction.state;
  if (!city) return null;
  return resolveArea(`${city}, ${state}`, await geoTables());
}

/**
 * Suggested workers for one job (C3.4) — never people who already engaged
 * with it. Only workers who chose to be findable for this kind of work, whose
 * home area is within the distance they said they'd travel, who haven't muted
 * the organization, and whose own do-not-match answers don't rule the job out
 * (boundaries only ever exclude). Each comes with what they share with
 * approved organizations (C2), never a combined score. An organization
 * Turfcut hasn't approved gets nobody.
 */
export async function loadMatches(
  jobId: string,
  orgId: string,
  opts: { now?: Date; scorecards?: boolean; onlyWorkerId?: string; includeEngaged?: boolean } = {}
): Promise<{ ok: true; rows: MatchRow[] } | { ok: false; reason: "not_approved" | "no_city" | "not_found" }> {
  const now = opts.now ?? new Date();
  const job = await db().job.findFirst({ where: { id: jobId, orgId }, select: JOB_SELECT });
  if (!job) return { ok: false, reason: "not_found" };
  if (!job.org.approved) return { ok: false, reason: "not_approved" };
  const here = await jobPoint(job);
  if (!here) return { ok: false, reason: "no_city" };

  // Each worker's latest sharing version; only the findable ones for this work type count.
  const latest = await db().workerSharing.findMany({
    where: opts.onlyWorkerId ? { workerId: opts.onlyWorkerId } : {},
    orderBy: [{ workerId: "asc" }, { version: "desc" }],
    distinct: ["workerId"],
  });
  const findable = latest.filter((s) => s.findable && s.workTypes.includes(job.type));
  if (!findable.length) return { ok: true, rows: [] };
  const ids = findable.map((s) => s.workerId);
  const [workers, engaged, muted] = await Promise.all([
    db().worker.findMany({ where: { id: { in: ids }, closedAt: null }, select: { id: true, displayName: true } }),
    db().engagement.findMany({ where: { jobId: job.id, workerId: { in: ids } }, select: { workerId: true } }),
    db().orgMute.findMany({ where: { orgId: job.orgId, workerId: { in: ids } }, select: { workerId: true } }),
  ]);
  const skip = new Set([...(opts.includeEngaged ? [] : engaged.map((e) => e.workerId)), ...muted.map((m) => m.workerId)]);
  const open = new Map(workers.filter((w) => !skip.has(w.id)).map((w) => [w.id, w.displayName]));

  const t = await geoTables();
  const disclosure = readDisclosure(job.campaignDisclosure);
  const near: Array<{ workerId: string; name: string; miles: number; travelMiles: number; travelSet: boolean }> = [];
  for (const s of findable) {
    const name = open.get(s.workerId);
    if (name === undefined) continue;
    const home = resolveArea(s.homeArea, t, job.jurisdiction.state);
    if (!home) continue; // an area Turfcut can't place is never guessed at
    const travelMiles = s.travelMiles ?? DEFAULT_TRAVEL_MILES;
    const miles = milesBetween(home, here);
    if (miles > travelMiles) continue;
    near.push({ workerId: s.workerId, name, miles, travelMiles, travelSet: s.travelMiles !== null });
  }
  // The worker's own do-not-match answers only ever keep them out (rule 4). Here they apply whatever
  // the answers' sharing mode or consent date: leaving someone out of a campaign they ruled out is
  // the safe side, and nothing about the answers reaches the organization.
  const prefs = await Promise.all(
    near.map(async (n) => {
      const raw = await loadLatestPreference(n.workerId);
      return [n.workerId, raw && { ...raw, visibilityMode: raw.visibilityMode === "PRIVATE" ? ("APPLIED_TO" as const) : raw.visibilityMode }] as const;
    })
  );
  const prefOf = new Map(prefs);
  const kept = near.filter((n) => !exclusionReasons(prefOf.get(n.workerId) ?? null, { disclosure, orgName: job.org.name, measureIds: job.measureIds }).length);
  if (!kept.length) return { ok: true, rows: [] };

  const keptIds = kept.map((k) => k.workerId);
  const [parts, availRows, credRows] = await Promise.all([
    partsForOrgMany(keptIds, job.orgId),
    db().workerAvailability.findMany({ where: { workerId: { in: keptIds } }, orderBy: [{ workerId: "asc" }, { version: "desc" }], distinct: ["workerId"] }),
    db().workerCredential.findMany({
      where: { workerId: { in: keptIds } },
      select: { workerId: true, id: true, kind: true, label: true, state: true, identifier: true, issuedOn: true, expiresOn: true, verification: true, supersedesId: true, removed: true, createdAt: true },
    }),
  ]);
  const wants = (id: string) => {
    const p = parts.get(id);
    return opts.scorecards !== false && !!p && (p.output || p.quality || p.reliability || p.history);
  };
  const cards = new Map(await Promise.all(keptIds.filter(wants).map(async (id) => [id, await loadScorecard(id, { now })] as const)));
  const avail = new Map(availRows.map((r) => [r.workerId, availabilityFromRow(r)]));
  const blank = computeScorecard([]);

  return {
    ok: true,
    rows: kept.map((k): MatchRow => {
      const p = parts.get(k.workerId)!;
      return {
        ...k,
        engagementId: k.workerId,
        closed: false,
        status: "APPLIED",
        stage: "",
        appliedAt: now,
        scorecard: shareScorecard(cards.get(k.workerId) ?? blank, cards.has(k.workerId) ? p : { ...p, output: false, quality: false, reliability: false, history: false }),
        availability: p.availability ? (avail.get(k.workerId) ?? EMPTY_AVAILABILITY) : "withheld",
        credentials: orgCredentialView(currentCredentials(credRows.filter((c) => c.workerId === k.workerId)), p.credentials),
      };
    }),
  };
}

/**
 * Whether a worker fits a job's matches right now (lets an organization invite them, C3.4). An
 * engagement already on the job doesn't count against it here: the invitation rules decide that
 * (only a lapsed invitation can be sent again).
 */
export async function isMatch(workerId: string, jobId: string, orgId: string, now = new Date()): Promise<boolean> {
  const r = await loadMatches(jobId, orgId, { now, scorecards: false, onlyWorkerId: workerId, includeEngaged: true });
  return r.ok && r.rows.some((m) => m.workerId === workerId);
}

/** How many matches each of these jobs has (the /hiring overview), without scorecards. */
export async function matchCounts(jobs: Array<{ id: string }>, orgId: string, now = new Date()): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  for (const j of jobs) {
    const r = await loadMatches(j.id, orgId, { now, scorecards: false });
    out.set(j.id, r.ok ? r.rows.length : null);
  }
  return out;
}
