import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { inviteLapsed, INVITES_PER_WEEK } from "@/lib/engagements";
import { moveEngagement } from "@/lib/engagements-data";

/**
 * Invitations from the worker's side (C3.3): the inbox, declining (with an
 * optional mute of the organization) and mutes. There are no read
 * receipts: opening an invitation records nothing the organization sees
 * (INVITE_VIEWED is never written — owner decision).
 */

/** The worker's open invitations, soonest deadline first, plus lapsed ones from the last two weeks. */
export async function loadInvitations(workerId: string, now = new Date()) {
  const rows = await db().engagement.findMany({
    where: { workerId, status: "INVITED" },
    select: {
      id: true, inviteNote: true, inviteExpiresAt: true, createdAt: true,
      job: { select: { id: true, title: true, type: true, startsAt: true, endsAt: true, compensationMethod: true, payRateCents: true, campaignDisclosure: true, measureIds: true, status: true, org: { select: { id: true, name: true } } } },
    },
    orderBy: [{ inviteExpiresAt: "asc" }, { createdAt: "desc" }],
  });
  const recent = now.getTime() - 14 * 86_400_000;
  return rows
    .map((r) => ({ ...r, lapsed: inviteLapsed("INVITED", r.inviteExpiresAt, now) || r.job.status === "CLOSED" }))
    .filter((r) => !r.lapsed || (r.inviteExpiresAt ?? r.createdAt).getTime() > recent);
}

/** Organizations the worker muted, newest first. */
export function loadMutes(workerId: string) {
  return db().orgMute.findMany({ where: { workerId }, select: { orgId: true, createdAt: true, org: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
}

type WorkerActor = { workerId: string; profileId: string };

/**
 * Mutes an organization: it can't invite the worker while muted. Idempotent.
 * Only an organization that has invited this worker can be muted from here,
 * so the call can't be used to test which organizations exist.
 */
export async function muteOrg(actor: WorkerActor, orgId: string, now = new Date()): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!UUID_RE.test(orgId)) return { ok: false, reason: "Organization not found." };
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`worker:${actor.workerId}`}))`;
    const invited = await tx.engagement.count({ where: { workerId: actor.workerId, job: { orgId }, events: { some: { type: "INVITED" } } } });
    if (!invited) return { ok: false as const, reason: "Organization not found." };
    const existing = await tx.orgMute.findUnique({ where: { workerId_orgId: { workerId: actor.workerId, orgId } } });
    if (existing) return { ok: true as const };
    await tx.orgMute.create({ data: { workerId: actor.workerId, orgId, createdAt: now } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "org.muted", entityType: "Worker", entityId: actor.workerId, metadata: { orgId }, createdAt: now } });
    return { ok: true as const };
  });
}

export async function unmuteOrg(actor: WorkerActor, orgId: string, now = new Date()): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!UUID_RE.test(orgId)) return { ok: false, reason: "Organization not found." };
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`worker:${actor.workerId}`}))`;
    const { count } = await tx.orgMute.deleteMany({ where: { workerId: actor.workerId, orgId } });
    if (!count) return { ok: false as const, reason: "That organization isn't muted." };
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "org.unmuted", entityType: "Worker", entityId: actor.workerId, metadata: { orgId }, createdAt: now } });
    return { ok: true as const };
  });
}

/** Declines an invitation; with `mute`, also mutes the organization that sent it. */
export async function declineInvitation(actor: WorkerActor, engagementId: string, opts: { mute?: boolean } = {}) {
  const r = await moveEngagement(engagementId, "decline", { kind: "worker", ...actor });
  if (!r.ok || !opts.mute) return r;
  const e = await db().engagement.findUnique({ where: { id: engagementId }, select: { job: { select: { orgId: true } } } });
  if (e) await muteOrg(actor, e.job.orgId);
  return r;
}

/**
 * One job's invitations from the organization's side (C3.3): who was
 * invited, by whom, with what note, and what happened. "Seen" is never
 * shown: there are no read receipts.
 */
export async function loadJobInvites(jobId: string, orgId: string) {
  return db().engagement.findMany({
    where: { jobId, job: { orgId }, events: { some: { type: "INVITED" } } },
    select: {
      id: true, status: true, createdAt: true, inviteNote: true, inviteExpiresAt: true,
      worker: { select: { displayName: true } },
      hiredBy: { select: { displayName: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
}

/** How many people sit under each hiring view of a job (the tabs). Applicants are everyone not invited. */
export async function hiringCounts(jobId: string, orgId: string) {
  const [invites, all] = await Promise.all([
    db().engagement.count({ where: { jobId, job: { orgId }, events: { some: { type: "INVITED" } } } }),
    db().engagement.count({ where: { jobId, job: { orgId }, status: { not: "INVITED" } } }),
  ]);
  const acceptedInvites = await db().engagement.count({ where: { jobId, job: { orgId }, status: { not: "INVITED" }, events: { some: { type: "INVITED" } } } });
  return { applicants: all - acceptedInvites, invites };
}

/** Invitations this organization can still send this worker in the current rolling week (C3). */
export async function invitesLeft(workerId: string, orgId: string, now = new Date()) {
  const sent = await db().engagementEvent.count({
    where: { type: "INVITED", createdAt: { gt: new Date(now.getTime() - 7 * 86_400_000) }, engagement: { workerId, job: { orgId } } },
  });
  return Math.max(0, INVITES_PER_WEEK - sent);
}
