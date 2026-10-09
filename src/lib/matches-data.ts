import { db } from "@/lib/db";
import { availabilityFromRow, EMPTY_AVAILABILITY } from "@/lib/availability";
import { currentCredentials, orgCredentialView } from "@/lib/credentials";
import { geoTables, milesBetween, resolveArea, type Point } from "@/lib/geo";
import { exclusionReasons, readDisclosure } from "@/lib/jobs";
import { effectivePreference } from "@/lib/political-fit";
import { loadLatestPreference } from "@/lib/political-fit-data";
import { computeScorecard } from "@/lib/scorecard";
import { loadScorecard } from "@/lib/scorecard-data";
import { shareScorecard } from "@/lib/shared-scorecard";
import { partsForOrgMany } from "@/lib/shared-scorecard-data";
import { SHARING_TEXT_VERSION } from "@/lib/sharing";
import type { ApplicantFacts } from "@/lib/applicants";

/**
 * When a findable worker has no travel distance (the form requires one, so
 * only a row saved some other way), how far they're matched.
 */
export const DEFAULT_TRAVEL_MILES = 25;

/**
 * The distance an organization sees: 5-mile bands, as text and as the only
 * value sent to the browser, so a home ZIP can't be worked back out.
 */
export function distanceBand(miles: number): { text: string; band: number } {
  const band = miles < 5 ? 0 : Math.round(miles / 5);
  return { text: band === 0 ? "under 5 mi" : `about ${band * 5} mi`, band };
}

export type MatchRow = ApplicantFacts & {
  workerId: string;
  miles: number;
  travelMiles: number;
  travelSet: boolean;
};

type Candidate = { workerId: string; name: string; home: Point; travelMiles: number; travelSet: boolean; workTypes: string[] };

/**
 * Workers who can be matched at all, right now: latest sharing findable and
 * confirmed under the wording that explains what Matches shows
 * (SHARING_TEXT_VERSION), an open account, and a home area Turfcut can
 * place for certain (a ZIP, "City, ST", or a city name unique in the US —
 * never placed by the job's state).
 */
async function candidates(onlyWorkerId?: string): Promise<Candidate[]> {
  const latest = await db().workerSharing.findMany({
    where: onlyWorkerId ? { workerId: onlyWorkerId } : {},
    orderBy: [{ workerId: "asc" }, { version: "desc" }],
    distinct: ["workerId"],
  });
  const findable = latest.filter((s) => s.findable && s.consentTextVersion === SHARING_TEXT_VERSION);
  if (!findable.length) return [];
  const workers = await db().worker.findMany({ where: { id: { in: findable.map((s) => s.workerId) }, closedAt: null }, select: { id: true, displayName: true } });
  const names = new Map(workers.map((w) => [w.id, w.displayName]));
  const t = await geoTables();
  const out: Candidate[] = [];
  for (const s of findable) {
    const name = names.get(s.workerId);
    const home = name === undefined ? null : resolveArea(s.homeArea, t);
    if (name === undefined || !home) continue;
    out.push({ workerId: s.workerId, name, home, travelMiles: s.travelMiles ?? DEFAULT_TRAVEL_MILES, travelSet: s.travelMiles !== null, workTypes: s.workTypes });
  }
  return out;
}

const JOB_SELECT = {
  id: true, orgId: true, type: true, status: true, geography: true, campaignDisclosure: true, measureIds: true,
  org: { select: { name: true, approved: true } },
  jurisdiction: { select: { state: true } },
} as const;
type MatchJob = { id: string; orgId: string; type: string; status: string; geography: unknown; campaignDisclosure: unknown; measureIds: string[]; org: { name: string; approved: boolean }; jurisdiction: { state: string } };

/** The job's place: its city in its state, from the bundled Census places. */
export async function jobPoint(job: Pick<MatchJob, "geography" | "jurisdiction">): Promise<Point | null> {
  const g = job.geography && typeof job.geography === "object" ? (job.geography as Record<string, unknown>) : {};
  const city = typeof g.city === "string" ? g.city : null;
  const state = typeof g.state === "string" ? g.state : job.jurisdiction.state;
  if (!city) return null;
  return resolveArea(`${city}, ${state}`, await geoTables());
}

type Refusal = "not_found" | "not_approved" | "not_open" | "no_city" | "city_unplaced";

/**
 * The near, eligible candidates for a job: its work type, within each
 * worker's travel distance, not already on the job, not muting the
 * organization, and not ruled out by their own do-not-match answers —
 * applied exactly as in their feed (only the answers they let Turfcut use,
 * under current consent; boundaries only ever exclude).
 */
async function nearFor(job: MatchJob, pool: Candidate[], now: Date, includeEngaged = false): Promise<Array<Candidate & { miles: number }> | Refusal> {
  if (!job.org.approved) return "not_approved";
  // Published (or paused) jobs only: a draft's city and campaign can still change, which would let
  // an organization move a draft around to learn where someone lives or which campaigns they ruled out.
  if (job.status !== "PUBLISHED" && job.status !== "PAUSED") return "not_open";
  const g = job.geography && typeof job.geography === "object" ? (job.geography as Record<string, unknown>) : {};
  if (typeof g.city !== "string" || !g.city.trim()) return "no_city";
  const here = await jobPoint(job);
  if (!here) return "city_unplaced";
  const typed = pool.filter((c) => c.workTypes.includes(job.type));
  if (!typed.length) return [];
  const ids = typed.map((c) => c.workerId);
  const [engaged, muted] = await Promise.all([
    includeEngaged ? Promise.resolve([]) : db().engagement.findMany({ where: { jobId: job.id, workerId: { in: ids } }, select: { workerId: true } }),
    db().orgMute.findMany({ where: { orgId: job.orgId, workerId: { in: ids } }, select: { workerId: true } }),
  ]);
  const skip = new Set([...engaged.map((e) => e.workerId), ...muted.map((m) => m.workerId)]);
  const near = typed
    .filter((c) => !skip.has(c.workerId))
    .map((c) => ({ ...c, miles: milesBetween(c.home, here) }))
    .filter((c) => c.miles <= c.travelMiles);
  const disclosure = readDisclosure(job.campaignDisclosure);
  const prefs = await Promise.all(near.map(async (c) => effectivePreference(await loadLatestPreference(c.workerId), now)));
  return near.filter((c, i) => !exclusionReasons(prefs[i], { disclosure, orgName: job.org.name, measureIds: job.measureIds }).length);
}

/**
 * Suggested workers for one job (C3.4), never people already on it. Each
 * comes with only what they share with approved organizations they haven't
 * engaged with (C2) — never a combined score. Approved organizations and
 * published jobs only.
 */
export async function loadMatches(
  jobId: string,
  orgId: string,
  opts: { now?: Date; scorecards?: boolean } = {}
): Promise<{ ok: true; rows: MatchRow[] } | { ok: false; reason: Refusal }> {
  const now = opts.now ?? new Date();
  const job = await db().job.findFirst({ where: { id: jobId, orgId }, select: JOB_SELECT });
  if (!job) return { ok: false, reason: "not_found" };
  const kept = await nearFor(job, await candidates(), now);
  if (typeof kept === "string") return { ok: false, reason: kept };
  if (!kept.length) return { ok: true, rows: [] };

  const keptIds = kept.map((k) => k.workerId);
  const [parts, availRows, credRows] = await Promise.all([
    partsForOrgMany(keptIds, job.orgId, { asStranger: true }),
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
        workerId: k.workerId,
        name: k.name,
        miles: k.miles,
        travelMiles: k.travelMiles,
        travelSet: k.travelSet,
        // The table's row fields (a match has no engagement yet).
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
 * Whether a worker fits a job's matches right now (lets an organization
 * invite them, C3.4). An engagement already on the job doesn't count against
 * it here: the invitation rules decide that (only a lapsed invitation can be
 * sent again).
 */
export async function isMatch(workerId: string, jobId: string, orgId: string, now = new Date()): Promise<boolean> {
  const job = await db().job.findFirst({ where: { id: jobId, orgId }, select: JOB_SELECT });
  if (!job) return false;
  const pool = await candidates(workerId);
  if (!pool.length) return false;
  const near = await nearFor(job, pool, now, true);
  return typeof near !== "string" && near.some((c) => c.workerId === workerId);
}

/** How many matches each job has (the /hiring overview): one pass over findable workers, no scorecards. */
export async function matchCounts(jobIds: string[], orgId: string, now = new Date()): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (!jobIds.length) return out;
  const [jobs, pool] = await Promise.all([db().job.findMany({ where: { id: { in: jobIds }, orgId }, select: JOB_SELECT }), candidates()]);
  for (const j of jobs) {
    const near = pool.length ? await nearFor(j, pool, now) : [];
    out.set(j.id, typeof near === "string" ? null : near.length);
  }
  return out;
}
