import { db } from "@/lib/db";
import { availabilityFromRow, EMPTY_AVAILABILITY } from "@/lib/availability";
import { currentCredentials, orgCredentialView } from "@/lib/credentials";
import { offerLapsed, workerStage } from "@/lib/engagements";
import { loadPipelineFacts } from "@/lib/engagements-data";
import { loadScorecard } from "@/lib/scorecard-data";
import { computeScorecard } from "@/lib/scorecard";
import { shareScorecard } from "@/lib/shared-scorecard";
import { partsForOrgMany } from "@/lib/shared-scorecard-data";
import type { ApplicantFacts } from "@/lib/applicants";

/**
 * Everyone who applied to or claimed a spot on one of the organization's
 * jobs (C3.2), each with what they share with it right now: the lifetime
 * scorecard (period comparisons are hours and history, and a table row
 * never needs them), availability and credentials. Invitations are the
 * organization's own act: they stay on the job page's Workers list (an
 * Invites view comes with C3.3), not here.
 *
 * Scorecards are the expensive part (every shift and its events), so they
 * load only when the table shows a scorecard column, and only for workers
 * who share at least one scorecard group with this organization.
 */
export async function loadApplicants(jobId: string, orgId: string, now = new Date(), opts: { scorecards?: boolean } = {}) {
  const engagements = await db().engagement.findMany({
    where: { jobId, job: { orgId }, status: { not: "INVITED" } },
    select: { id: true, status: true, createdAt: true, applicationSnapshot: true, worker: { select: { id: true, displayName: true, closedAt: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const facts = await loadPipelineFacts(engagements.map((e) => e.id));
  // The opening step says how it began; rows from before C3 fall back to the copy they kept.
  const fromWorker = engagements.filter((e) => {
    const first = facts.get(e.id)?.events[0]?.type;
    if (first) return first === "APPLIED" || first === "CLAIMED";
    const kind = (e.applicationSnapshot as { kind?: unknown } | null)?.kind;
    return kind !== "invitation";
  });
  const ids = [...new Set(fromWorker.map((e) => e.worker.id))];
  const [parts, availRows, credRows] = await Promise.all([
    partsForOrgMany(ids, orgId),
    db().workerAvailability.findMany({ where: { workerId: { in: ids } }, orderBy: [{ workerId: "asc" }, { version: "desc" }], distinct: ["workerId"] }),
    db().workerCredential.findMany({
      where: { workerId: { in: ids } },
      select: { workerId: true, id: true, kind: true, label: true, state: true, identifier: true, issuedOn: true, expiresOn: true, verification: true, supersedesId: true, removed: true, createdAt: true },
    }),
  ]);
  const wantsCard = (id: string) => {
    const p = parts.get(id);
    return opts.scorecards !== false && !!p && (p.output || p.quality || p.reliability || p.history);
  };
  const scorecards = await Promise.all(ids.filter(wantsCard).map(async (id) => [id, await loadScorecard(id, { now })] as const));
  const blank = computeScorecard([]);
  const avail = new Map(availRows.map((r) => [r.workerId, availabilityFromRow(r)]));
  const cards = new Map(scorecards);

  return fromWorker.map((e): ApplicantFacts & { inReview: boolean; offerExpiresAt: Date | null } => {
    const w = e.worker.id;
    const p = parts.get(w)!;
    const f = facts.get(e.id) ?? { events: [], inReview: false, offerExpiresAt: null };
    return {
      engagementId: e.id,
      name: e.worker.displayName,
      closed: !!e.worker.closedAt,
      status: e.status,
      stage: workerStage(e.status, f.events, offerLapsed(e.status, f.offerExpiresAt, now)),
      appliedAt: e.createdAt,
      // Not loaded = nothing of it is shared (or no column needs it): every part reads as withheld or unused.
      scorecard: shareScorecard(cards.get(w) ?? blank, cards.has(w) ? p : { ...p, output: false, quality: false, reliability: false, history: false }),
      availability: p.availability ? (avail.get(w) ?? EMPTY_AVAILABILITY) : "withheld",
      credentials: orgCredentialView(currentCredentials(credRows.filter((c) => c.workerId === w)), p.credentials),
      inReview: f.inReview,
      offerExpiresAt: f.offerExpiresAt,
    };
  });
}
