import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  ACCEPTED_STATUSES,
  buildSnapshot,
  cleanNote,
  JOB_CLOSED_NOTE,
  eventFor,
  inviteExpiresAt,
  inviteLapsed,
  INVITES_PER_WEEK,
  NOT_SELECTED_REASONS,
  NOTE_MAX,
  offerExpiresAt,
  offerLapsed,
  transition,
  type EngagementAction,
  type HiringSnapshot,
} from "@/lib/engagements";
import { exclusionReasons, readDisclosure, readHiringModes, UUID_RE } from "@/lib/jobs";
import { effectivePreference, employerFitView } from "@/lib/political-fit";
import { loadLatestPreference, orgHasRelationship } from "@/lib/political-fit-data";
import { loadScorecard } from "@/lib/scorecard-data";
import { loadSharing } from "@/lib/sharing-data";
import { visibleParts } from "@/lib/sharing";
import { shareScorecard } from "@/lib/shared-scorecard";
import { defaultBoss } from "@/lib/chat-data";
import { isMatch } from "@/lib/matches-data";
import { notifyStep } from "@/lib/notifications-data";

type Result = { ok: true; engagementId: string; status: string } | { ok: false; reason: string };
type Tx = Prisma.TransactionClient;

/**
 * Offers on this job, other than `exceptId`, still inside their window: each
 * holds a seat (engagements.ts). Read under the job's lock.
 */
async function liveOffers(tx: Tx, jobId: string, exceptId: string | null, now: Date) {
  const offered = await tx.engagement.findMany({
    where: { jobId, status: "OFFERED", ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { events: { where: { type: "OFFERED" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
  });
  return offered.filter((o) => o.events[0] && offerExpiresAt(o.events[0].createdAt) > now).length;
}


/** What the organization can see of this worker for this job, right now. */
async function snapshotFor(
  kind: HiringSnapshot["kind"],
  workerId: string,
  job: { orgId: string; campaignDisclosure: unknown },
  now: Date
): Promise<HiringSnapshot> {
  const [scorecard, latest, related, sharing, org] = await Promise.all([
    loadScorecard(workerId, { now }),
    loadLatestPreference(workerId),
    orgHasRelationship(workerId, job.orgId),
    loadSharing(workerId),
    db().organization.findUnique({ where: { id: job.orgId }, select: { approved: true } }),
  ]);
  // Applying or claiming creates the relationship; an invite is the org's
  // decision, so it sees only a relationship the worker already started
  // (an earlier, unaccepted invitation doesn't count).
  const relationship = kind === "invitation" ? related : true;
  // An organization Turfcut hasn't approved (or no longer approves) sees none
  // of the worker's answers, as it sees none of the scorecard below.
  const fit = employerFitView(effectivePreference(latest, now), {
    orgHasRelationship: (org?.approved ?? false) && relationship,
    campaign: readDisclosure(job.campaignDisclosure),
  });
  const parts = visibleParts(sharing.choices, { kind: "org", approved: org?.approved ?? false, relationship });
  return buildSnapshot({
    kind,
    scorecard: shareScorecard(scorecard, parts),
    sharingVersion: sharing.version,
    fit,
    consentVersion: latest?.consentVersion ?? null,
    now,
  });
}

/**
 * Creates a new engagement (apply / claim / invite). Runs under a per-job
 * lock so concurrent claims can't overfill headcount.
 */
async function open(
  action: "apply" | "claim" | "invite",
  actor: { kind: "worker" | "org"; profileId: string; orgId?: string },
  jobId: string,
  workerId: string,
  now?: Date,
  opts: { note?: string } = {}
): Promise<Result> {
  // `now` is for backdated runs (the demo seed); otherwise the clock is read
  // again once the locks are held, so history stays in commit order.
  const before = now ?? new Date();
  const note = action === "invite" ? cleanNote(opts.note) : null;
  if (note && note.length > NOTE_MAX) return { ok: false, reason: `Keep the note to ${NOTE_MAX} characters or fewer.` };
  if (!UUID_RE.test(jobId)) return { ok: false, reason: "Job not found." };
  if (!UUID_RE.test(workerId)) return { ok: false, reason: "Worker not found." };
  const job = await db().job.findUnique({ where: { id: jobId }, include: { org: { select: { name: true } } } });
  if (!job) return { ok: false, reason: "Job not found." };
  if (actor.kind === "org" && actor.orgId !== job.orgId) return { ok: false, reason: "This job belongs to another organization." };
  // No directory (C1): an organization invites only workers who have already
  // engaged with one of its jobs. Unknown and unrelated ids get the same
  // answer, so invitations can't be used to probe for worker ids.
  // ...or, since C3.4, a worker who chose to be findable and matches this job (Matches).
  const viaMatch = action === "invite" && !(await orgHasRelationship(workerId, job.orgId));
  if (viaMatch && !(await isMatch(workerId, jobId, job.orgId, before))) return { ok: false, reason: "Worker not found." };
  const w = await db().worker.findUnique({ where: { id: workerId }, select: { closedAt: true } });
  if (!w) return { ok: false, reason: "Worker not found." };
  if (w.closedAt) return { ok: false, reason: "This worker has closed their account." };

  // A worker never lands on a job their own do-not-match answers exclude.
  if (actor.kind === "worker") {
    const pref = effectivePreference(await loadLatestPreference(workerId), before);
    const reasons = exclusionReasons(pref, { disclosure: readDisclosure(job.campaignDisclosure), orgName: job.org.name, measureIds: job.measureIds });
    if (reasons.length) return { ok: false, reason: `${reasons[0]}. Change your preferences to see this job.` };
  }

  const kind = action === "apply" ? "application" : action === "claim" ? "claim" : "invitation";
  const snapshot = await snapshotFor(kind, workerId, job, before);

  return db().$transaction(async (tx) => {
    // Worker before job (closing an account holds the worker lock; nothing takes job → worker).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`worker:${workerId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`job:${jobId}`}))`;
    const at = now ?? new Date();
    const [existing, acceptedCount, fresh, wk, offers] = await Promise.all([
      tx.engagement.findUnique({ where: { jobId_workerId: { jobId, workerId } } }),
      tx.engagement.count({ where: { jobId, status: { in: ACCEPTED_STATUSES } } }),
      tx.job.findUniqueOrThrow({ where: { id: jobId } }),
      tx.worker.findUniqueOrThrow({ where: { id: workerId }, select: { closedAt: true, profileId: true } }),
      liveOffers(tx, jobId, null, at),
    ]);
    if (wk.closedAt) return { ok: false as const, reason: "This worker has closed their account." };
    if (action === "invite") {
      // A worker who muted this organization reads like any worker it can't reach (no directory, C1).
      const muted = await tx.orgMute.findUnique({ where: { workerId_orgId: { workerId, orgId: fresh.orgId } } });
      if (muted) return { ok: false as const, reason: "Worker not found." };
      // Reached through Matches: still findable now, under the lock (they may have just turned it off).
      if (viaMatch) {
        const s = await tx.workerSharing.findFirst({ where: { workerId }, orderBy: { version: "desc" }, select: { findable: true } });
        if (!s?.findable) return { ok: false as const, reason: "Worker not found." };
      }
      // At most INVITES_PER_WEEK invitations from one organization to one worker in any 7 days (C3).
      const recent = await tx.engagementEvent.count({
        where: { type: "INVITED", createdAt: { gt: new Date(at.getTime() - 7 * 86_400_000), lte: at }, engagement: { workerId, job: { orgId: fresh.orgId } } },
      });
      if (recent >= INVITES_PER_WEEK) return { ok: false as const, reason: `You've sent this worker ${INVITES_PER_WEEK} invitations this week, the most allowed. Try again in a few days.` };
    }
    const t = transition(existing?.status ?? null, action, actor.kind, {
      jobStatus: fresh.status,
      hiringModes: readHiringModes(fresh.hiringMethod),
      headcount: fresh.headcount,
      acceptedCount,
      liveOffers: offers,
      inviteExpired: !!existing && inviteLapsed(existing.status, existing.inviteExpiresAt, at),
    });
    if (!t.ok) return { ok: false as const, reason: t.reason };
    // Who the worker's direct messages are with: the inviter, or for an
    // instant claim the job's creator (else the owner). Applications get
    // theirs when someone accepts.
    const hiredById = action === "invite" ? actor.profileId : action === "claim" ? await defaultBoss(tx, jobId, fresh.orgId) : null;
    if (existing) {
      // Renewing a lapsed invitation: a fresh note, deadline and inviter on the same row (its first
      // snapshot stays as the record of what the organization saw), and a new INVITED line.
      await tx.engagement.update({ where: { id: existing.id }, data: { hiredById, inviteNote: note, inviteExpiresAt: inviteExpiresAt(at) } });
      await tx.engagementEvent.create({ data: { engagementId: existing.id, type: "INVITED", actorId: actor.profileId, note, createdAt: at } });
      await notifyStep(tx, "INVITED", { id: existing.id, hiredById, worker: wk, job: { orgId: fresh.orgId } }, actor.profileId, at);
      await tx.auditEvent.create({
        data: { actorId: actor.profileId, action: "engagement.reinvited", entityType: "Engagement", entityId: existing.id, metadata: { jobId, workerId }, createdAt: at },
      });
      return { ok: true as const, engagementId: existing.id, status: "INVITED" };
    }
    const engagement = await tx.engagement.create({
      data: {
        jobId, workerId, status: t.status, hiredById, applicationSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        ...(action === "invite" ? { inviteNote: note, inviteExpiresAt: inviteExpiresAt(at) } : {}),
      },
    });
    // The invitation's note also goes on its history line, where both sides read it.
    const opening = eventFor(action, actor.kind, null, t.status);
    await tx.engagementEvent.create({
      data: { engagementId: engagement.id, type: opening, actorId: actor.profileId, note, createdAt: at },
    });
    await notifyStep(tx, opening, { id: engagement.id, hiredById, worker: wk, job: { orgId: fresh.orgId } }, actor.profileId, at);
    await tx.auditEvent.create({
      data: {
        actorId: actor.profileId,
        action: `engagement.${action === "apply" ? "applied" : action === "claim" ? "claimed" : "invited"}`,
        entityType: "Engagement",
        entityId: engagement.id,
        metadata: { jobId, workerId, status: t.status, consentVersion: snapshot.consentVersion },
        createdAt: at,
      },
    });
    return { ok: true as const, engagementId: engagement.id, status: t.status };
  });
}

export const applyToJob = (workerId: string, profileId: string, jobId: string, now?: Date) =>
  open("apply", { kind: "worker", profileId }, jobId, workerId, now);

export const claimJob = (workerId: string, profileId: string, jobId: string, now?: Date) =>
  open("claim", { kind: "worker", profileId }, jobId, workerId, now);

export const inviteWorker = (orgId: string, profileId: string, jobId: string, workerId: string, now?: Date, opts: { note?: string } = {}) =>
  open("invite", { kind: "org", profileId, orgId }, jobId, workerId, now, opts);

type Actor = { kind: "worker"; profileId: string; workerId: string } | { kind: "org"; profileId: string; orgId: string };

/** Org sends an offer for an application; worker accepts an invitation or an offer. */
export const acceptEngagement = (engagementId: string, actor: Actor, now?: Date) => moveEngagement(engagementId, "accept", actor, {}, now);

/**
 * Moves an existing engagement along the hiring pipeline (C3): review, offer,
 * accept, decline, withdraw. Each step appends an EngagementEvent and an
 * audit event under the job's lock. A decline by the organization ("not
 * selected") needs a reason code; an optional note is shown to the worker.
 */
export async function moveEngagement(
  engagementId: string,
  action: Exclude<EngagementAction, "apply" | "claim" | "invite">,
  actor: Actor,
  opts: { reasonCode?: string; note?: string } = {},
  now?: Date
): Promise<Result> {
  if (!UUID_RE.test(engagementId)) return { ok: false, reason: "Engagement not found." };
  const e = await db().engagement.findUnique({ where: { id: engagementId }, include: { job: { include: { org: { select: { name: true } } } } } });
  if (!e) return { ok: false, reason: "Engagement not found." };
  if (actor.kind === "worker" && e.workerId !== actor.workerId) return { ok: false, reason: "Engagement not found." };
  if (actor.kind === "org" && e.job.orgId !== actor.orgId) return { ok: false, reason: "Engagement not found." };

  const declining = action === "decline" && actor.kind === "org";
  const reasonCode = declining ? (opts.reasonCode ?? "") : null;
  if (declining && !NOT_SELECTED_REASONS.some((r) => r.value === reasonCode)) return { ok: false, reason: "Pick a reason." };
  const note = actor.kind === "org" && (action === "decline" || action === "offer") ? cleanNote(opts.note) : null;
  if (note && note.length > NOTE_MAX) return { ok: false, reason: `Keep the note to ${NOTE_MAX} characters or fewer.` };

  // Taking a job never overrides the worker's own do-not-match answers.
  if (action === "accept" && actor.kind === "worker") {
    const pref = effectivePreference(await loadLatestPreference(actor.workerId), now ?? new Date());
    const reasons = exclusionReasons(pref, { disclosure: readDisclosure(e.job.campaignDisclosure), orgName: e.job.org.name, measureIds: e.job.measureIds });
    if (reasons.length) return { ok: false, reason: `${reasons[0]}. Change your preferences to accept this job.` };
  }

  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`worker:${e.workerId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`job:${e.jobId}`}))`;
    // Read the clock once the locks are held (see open()).
    const at = now ?? new Date();
    const [current, acceptedCount, job, wk, reviewed, lastOffer, offers] = await Promise.all([
      tx.engagement.findUniqueOrThrow({ where: { id: engagementId } }),
      tx.engagement.count({ where: { jobId: e.jobId, status: { in: ACCEPTED_STATUSES } } }),
      tx.job.findUniqueOrThrow({ where: { id: e.jobId } }),
      tx.worker.findUniqueOrThrow({ where: { id: e.workerId }, select: { closedAt: true, profileId: true } }),
      tx.engagementEvent.count({ where: { engagementId, type: "IN_REVIEW" } }),
      tx.engagementEvent.findFirst({ where: { engagementId, type: "OFFERED" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      liveOffers(tx, e.jobId, engagementId, at),
    ]);
    if (wk.closedAt) return { ok: false as const, reason: "This worker has closed their account." };
    const t = transition(current.status, action, actor.kind, {
      jobStatus: job.status,
      hiringModes: readHiringModes(job.hiringMethod),
      headcount: job.headcount,
      acceptedCount,
      inReview: reviewed > 0,
      offerExpired: offerLapsed(current.status, lastOffer ? offerExpiresAt(lastOffer.createdAt) : null, at),
      inviteExpired: inviteLapsed(current.status, current.inviteExpiresAt, at),
      liveOffers: offers,
    });
    if (!t.ok) return { ok: false as const, reason: t.reason };
    // The worker's contact: whoever sends the offer, or the inviter.
    const hiredById =
      actor.kind === "org" && t.status === "OFFERED" ? actor.profileId : (current.hiredById ?? (t.status === "ACTIVE" ? await defaultBoss(tx, e.jobId, job.orgId) : null));
    if (t.status !== current.status || hiredById !== current.hiredById) {
      await tx.engagement.update({ where: { id: engagementId }, data: { status: t.status, hiredById } });
    }
    const type = eventFor(action, actor.kind, current.status, t.status);
    await tx.engagementEvent.create({ data: { engagementId, type, actorId: actor.profileId, reasonCode, note, createdAt: at } });
    await notifyStep(tx, type, { id: engagementId, hiredById, worker: wk, job: { orgId: job.orgId } }, actor.profileId, at);
    await tx.auditEvent.create({
      data: {
        actorId: actor.profileId,
        action: `engagement.${type.toLowerCase()}`,
        entityType: "Engagement",
        entityId: engagementId,
        metadata: { from: current.status, to: t.status, by: actor.kind, ...(reasonCode ? { reasonCode } : {}) },
        createdAt: at,
      },
    });
    return { ok: true as const, engagementId, status: t.status };
  });
}

/** Most rows one bulk step moves (a job's applicant list is far shorter). */
export const BULK_MAX = 100;

/**
 * One step for several of one job's engagements (C3.2 bulk actions): in
 * review, offer, or not selected with one reason and note for all. Each goes
 * through moveEngagement on its own, in the order they arrived (so offers go
 * to the earliest first while seats last); ids that aren't this job's are
 * counted, never touched.
 */
export async function moveEngagements(
  jobId: string,
  actor: { profileId: string; orgId: string },
  action: "review" | "offer" | "decline",
  engagementIds: string[],
  opts: { reasonCode?: string; note?: string } = {}
): Promise<{ ok: true; moved: number; refused: Array<{ reason: string; names: string[] }> } | { ok: false; reason: string }> {
  if (!UUID_RE.test(jobId)) return { ok: false, reason: "Job not found." };
  const picked = [...new Set(engagementIds)];
  if (!picked.length) return { ok: false, reason: "Select at least one applicant." };
  if (picked.length > BULK_MAX) return { ok: false, reason: `Select at most ${BULK_MAX} at a time.` };
  const rows = await db().engagement.findMany({
    where: { id: { in: picked.filter((id) => UUID_RE.test(id)) }, jobId, job: { orgId: actor.orgId } },
    select: { id: true, worker: { select: { displayName: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  let moved = 0;
  const refused = new Map<string, string[]>();
  for (const e of rows) {
    const r = await moveEngagement(e.id, action, { kind: "org", ...actor }, opts);
    if (r.ok) moved++;
    else refused.set(r.reason, [...(refused.get(r.reason) ?? []), e.worker.displayName]);
  }
  const missing = picked.length - rows.length;
  if (missing) refused.set("Not an applicant on this job.", [`${missing} selected`]);
  return { ok: true, moved, refused: [...refused].map(([reason, names]) => ({ reason, names })) };
}

export type HistoryEvent = Awaited<ReturnType<typeof loadEngagementEvents>>[number];

/**
 * Per engagement: its history, whether it is in review, and when a pending
 * offer lapses. One query for a whole list.
 */
export async function loadPipelineFacts(engagementIds: string[]) {
  const events = engagementIds.length
    ? await db().engagementEvent.findMany({
        where: { engagementId: { in: engagementIds } },
        orderBy: { createdAt: "asc" },
        select: { id: true, engagementId: true, type: true, reasonCode: true, note: true, createdAt: true },
      })
    : [];
  return new Map(
    engagementIds.map((id) => {
      const mine = events.filter((e) => e.engagementId === id);
      const offer = mine.filter((e) => e.type === "OFFERED").at(-1);
      return [id, { events: mine, inReview: mine.some((e) => e.type === "IN_REVIEW"), offerExpiresAt: offer ? offerExpiresAt(offer.createdAt) : null }] as const;
    })
  );
}

/** An engagement's history, oldest first (what the worker and the organization see). */
export function loadEngagementEvents(engagementId: string) {
  return db().engagementEvent.findMany({
    where: { engagementId },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, reasonCode: true, note: true, createdAt: true },
  });
}

/**
 * Closes a published or paused job (C3.5): nobody can apply, claim or be
 * invited any more, and every open engagement on it ends with a history
 * line and a notice to the worker — applications and offers as not
 * selected ("another reason", with a note that the job closed), invitations
 * withdrawn. People already hired stay hired; their shifts are untouched.
 * Under the job's lock, so no application or offer slips in meanwhile.
 */
export async function closeJob(jobId: string, actor: { profileId: string; orgId: string }, now?: Date): Promise<{ ok: true; closed: number } | { ok: false; reason: string }> {
  if (!UUID_RE.test(jobId)) return { ok: false, reason: "Job not found." };
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`job:${jobId}`}))`;
    const at = now ?? new Date();
    const job = await tx.job.findFirst({ where: { id: jobId, orgId: actor.orgId }, select: { status: true, orgId: true } });
    if (!job) return { ok: false as const, reason: "Job not found." };
    if (job.status !== "PUBLISHED" && job.status !== "PAUSED") return { ok: false as const, reason: job.status === "CLOSED" ? "This job is already closed." : "Only a published or paused job can be closed." };
    await tx.job.update({ where: { id: jobId }, data: { status: "CLOSED" } });
    const open = await tx.engagement.findMany({
      where: { jobId, status: { in: ["APPLIED", "OFFERED", "INVITED"] } },
      select: { id: true, status: true, hiredById: true, worker: { select: { profileId: true, closedAt: true } } },
    });
    let closed = 0;
    for (const e of open) {
      const to = e.status === "INVITED" ? "WITHDRAWN" : "DECLINED";
      // Conditional: an account closure (which holds only the worker's lock) may have ended it meanwhile.
      const { count } = await tx.engagement.updateMany({ where: { id: e.id, status: e.status }, data: { status: to } });
      if (!count) continue;
      closed++;
      const type = e.status === "INVITED" ? "INVITE_WITHDRAWN" : "NOT_SELECTED";
      await tx.engagementEvent.create({
        data: { engagementId: e.id, type, actorId: actor.profileId, reasonCode: type === "NOT_SELECTED" ? "other" : null, note: JOB_CLOSED_NOTE, createdAt: at },
      });
      await notifyStep(tx, type, { id: e.id, hiredById: e.hiredById, worker: e.worker, job: { orgId: job.orgId } }, actor.profileId, at, "JOB_CLOSED");
    }
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "job.closed", entityType: "Job", entityId: jobId, metadata: { closedEngagements: closed }, createdAt: at } });
    return { ok: true as const, closed };
  });
}
