import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  ACCEPTED_STATUSES,
  buildSnapshot,
  transition,
  type EngagementAction,
  type HiringSnapshot,
} from "@/lib/engagements";
import { exclusionReasons, readDisclosure, readHiringModes, UUID_RE } from "@/lib/jobs";
import { effectivePreference, employerFitView } from "@/lib/political-fit";
import { loadLatestPreference, orgHasRelationship } from "@/lib/political-fit-data";
import { loadScorecard } from "@/lib/scorecard-data";
import { defaultBoss } from "@/lib/chat-data";

type Result = { ok: true; engagementId: string; status: string } | { ok: false; reason: string };

/** What the organization can see of this worker for this job, right now. */
async function snapshotFor(
  kind: HiringSnapshot["kind"],
  workerId: string,
  job: { orgId: string; campaignDisclosure: unknown },
  now: Date
): Promise<HiringSnapshot> {
  const [scorecard, latest, related] = await Promise.all([
    loadScorecard(workerId, { now }),
    loadLatestPreference(workerId),
    orgHasRelationship(workerId, job.orgId),
  ]);
  // Applying or claiming creates the relationship; an invite is the org's
  // decision, so it sees only a relationship the worker already started
  // (an earlier, unaccepted invitation doesn't count).
  const relationship = kind === "invitation" ? related : true;
  const fit = employerFitView(effectivePreference(latest, now), {
    orgHasRelationship: relationship,
    campaign: readDisclosure(job.campaignDisclosure),
  });
  return buildSnapshot({ kind, scorecard, fit, consentVersion: latest?.consentVersion ?? null, now });
}

/**
 * Creates a new engagement (apply / claim / invite). Runs under a per-job
 * lock so concurrent claims can't overfill headcount.
 */
async function open(
  action: Exclude<EngagementAction, "accept">,
  actor: { kind: "worker" | "org"; profileId: string; orgId?: string },
  jobId: string,
  workerId: string,
  now: Date
): Promise<Result> {
  if (!UUID_RE.test(jobId)) return { ok: false, reason: "Job not found." };
  if (!UUID_RE.test(workerId)) return { ok: false, reason: "Worker not found." };
  const job = await db().job.findUnique({ where: { id: jobId }, include: { org: { select: { name: true } } } });
  if (!job) return { ok: false, reason: "Job not found." };
  if (actor.kind === "org" && actor.orgId !== job.orgId) return { ok: false, reason: "This job belongs to another organization." };
  // No directory (C1): an organization invites only workers who have already
  // engaged with one of its jobs. Unknown and unrelated ids get the same
  // answer, so invitations can't be used to probe for worker ids.
  if (action === "invite" && !(await orgHasRelationship(workerId, job.orgId))) return { ok: false, reason: "Worker not found." };
  const w = await db().worker.findUnique({ where: { id: workerId }, select: { closedAt: true } });
  if (!w) return { ok: false, reason: "Worker not found." };
  if (w.closedAt) return { ok: false, reason: "This worker has closed their account." };

  // A worker never lands on a job their own do-not-match answers exclude.
  if (actor.kind === "worker") {
    const pref = effectivePreference(await loadLatestPreference(workerId), now);
    const reasons = exclusionReasons(pref, { disclosure: readDisclosure(job.campaignDisclosure), orgName: job.org.name, measureIds: job.measureIds });
    if (reasons.length) return { ok: false, reason: `${reasons[0]}. Change your preferences to see this job.` };
  }

  const kind = action === "apply" ? "application" : action === "claim" ? "claim" : "invitation";
  const snapshot = await snapshotFor(kind, workerId, job, now);

  return db().$transaction(async (tx) => {
    // Worker before job (closing an account holds the worker lock; nothing takes job → worker).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`worker:${workerId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`job:${jobId}`}))`;
    const [existing, acceptedCount, fresh, wk] = await Promise.all([
      tx.engagement.findUnique({ where: { jobId_workerId: { jobId, workerId } } }),
      tx.engagement.count({ where: { jobId, status: { in: ACCEPTED_STATUSES } } }),
      tx.job.findUniqueOrThrow({ where: { id: jobId } }),
      tx.worker.findUniqueOrThrow({ where: { id: workerId }, select: { closedAt: true } }),
    ]);
    if (wk.closedAt) return { ok: false as const, reason: "This worker has closed their account." };
    const t = transition(existing?.status ?? null, action, actor.kind, {
      jobStatus: fresh.status,
      hiringModes: readHiringModes(fresh.hiringMethod),
      headcount: fresh.headcount,
      acceptedCount,
    });
    if (!t.ok) return { ok: false as const, reason: t.reason };
    // Who the worker's direct messages are with: the inviter, or for an
    // instant claim the job's creator (else the owner). Applications get
    // theirs when someone accepts.
    const hiredById = action === "invite" ? actor.profileId : action === "claim" ? await defaultBoss(tx, jobId, fresh.orgId) : null;
    const engagement = await tx.engagement.create({
      data: { jobId, workerId, status: t.status, hiredById, applicationSnapshot: snapshot as unknown as Prisma.InputJsonValue },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.profileId,
        action: `engagement.${action === "apply" ? "applied" : action === "claim" ? "claimed" : "invited"}`,
        entityType: "Engagement",
        entityId: engagement.id,
        metadata: { jobId, workerId, status: t.status, consentVersion: snapshot.consentVersion },
      },
    });
    return { ok: true as const, engagementId: engagement.id, status: t.status };
  });
}

export const applyToJob = (workerId: string, profileId: string, jobId: string, now = new Date()) =>
  open("apply", { kind: "worker", profileId }, jobId, workerId, now);

export const claimJob = (workerId: string, profileId: string, jobId: string, now = new Date()) =>
  open("claim", { kind: "worker", profileId }, jobId, workerId, now);

export const inviteWorker = (orgId: string, profileId: string, jobId: string, workerId: string, now = new Date()) =>
  open("invite", { kind: "org", profileId, orgId }, jobId, workerId, now);

/** Org accepts an application, or worker accepts an invitation. */
export async function acceptEngagement(
  engagementId: string,
  actor: { kind: "worker"; profileId: string; workerId: string } | { kind: "org"; profileId: string; orgId: string }
): Promise<Result> {
  if (!UUID_RE.test(engagementId)) return { ok: false, reason: "Engagement not found." };
  const e = await db().engagement.findUnique({ where: { id: engagementId }, include: { job: { include: { org: { select: { name: true } } } } } });
  if (!e) return { ok: false, reason: "Engagement not found." };
  if (actor.kind === "worker" && e.workerId !== actor.workerId) return { ok: false, reason: "This isn't your invitation." };
  if (actor.kind === "org" && e.job.orgId !== actor.orgId) return { ok: false, reason: "This application is for another organization." };
  // An invitation never overrides the worker's own do-not-match answers.
  if (actor.kind === "worker") {
    const pref = effectivePreference(await loadLatestPreference(actor.workerId));
    const reasons = exclusionReasons(pref, { disclosure: readDisclosure(e.job.campaignDisclosure), orgName: e.job.org.name, measureIds: e.job.measureIds });
    if (reasons.length) return { ok: false, reason: `${reasons[0]}. Change your preferences to accept this job.` };
  }

  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`worker:${e.workerId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`job:${e.jobId}`}))`;
    const [current, acceptedCount, job, wk] = await Promise.all([
      tx.engagement.findUniqueOrThrow({ where: { id: engagementId } }),
      tx.engagement.count({ where: { jobId: e.jobId, status: { in: ACCEPTED_STATUSES } } }),
      tx.job.findUniqueOrThrow({ where: { id: e.jobId } }),
      tx.worker.findUniqueOrThrow({ where: { id: e.workerId }, select: { closedAt: true } }),
    ]);
    if (wk.closedAt) return { ok: false as const, reason: "This worker has closed their account." };
    const t = transition(current.status, "accept", actor.kind, {
      jobStatus: job.status,
      hiringModes: readHiringModes(job.hiringMethod),
      headcount: job.headcount,
      acceptedCount,
    });
    if (!t.ok) return { ok: false as const, reason: t.reason };
    // The org member who accepts an application is the worker's contact;
    // an accepted invitation keeps its inviter.
    const hiredById = actor.kind === "org" ? actor.profileId : (current.hiredById ?? (await defaultBoss(tx, e.jobId, job.orgId)));
    await tx.engagement.update({ where: { id: engagementId }, data: { status: t.status, hiredById } });
    await tx.auditEvent.create({
      data: {
        actorId: actor.profileId,
        action: "engagement.accepted",
        entityType: "Engagement",
        entityId: engagementId,
        metadata: { from: current.status, to: t.status, acceptedBy: actor.kind },
      },
    });
    return { ok: true as const, engagementId, status: t.status };
  });
}
