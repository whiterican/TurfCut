import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { exclusionReasons, readDisclosure, UUID_RE } from "@/lib/jobs";
import { effectivePreference } from "@/lib/political-fit";
import { loadLatestPreference } from "@/lib/political-fit-data";
import { inviteLapsed, INVITES_PER_WEEK } from "@/lib/engagements";
import { moveEngagement } from "@/lib/engagements-data";

/**
 * Invitations from the worker's side (C3.3): the inbox, declining (with an
 * optional mute of the organization) and mutes. There are no read
 * receipts: opening an invitation records nothing the organization sees
 * (INVITE_VIEWED is never written — owner decision).
 */

/**
 * An engagement that began as an invitation: any invitation step in its
 * history (an invitation from before C3 history still gets its answer
 * recorded), or the copy it kept, or still waiting.
 */
const INVITATION: Prisma.EngagementWhereInput = {
  OR: [
    { events: { some: { type: { in: ["INVITED", "INVITE_ACCEPTED", "INVITE_DECLINED", "INVITE_WITHDRAWN"] } } } },
    { applicationSnapshot: { path: ["kind"], equals: "invitation" } },
    { status: "INVITED" },
  ],
};

/**
 * The worker's open invitations, soonest deadline first, plus lapsed ones
 * from the last two weeks. As in the feed, an invitation to a job the
 * worker's own do-not-match answers rule out never shows (rule 4).
 */
export async function loadInvitations(workerId: string, now = new Date()) {
  const latest = await loadLatestPreference(workerId);
  const pref = effectivePreference(latest, now);
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
    .filter((r) => !exclusionReasons(pref, { disclosure: readDisclosure(r.job.campaignDisclosure), orgName: r.job.org.name, measureIds: r.job.measureIds }).length)
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
    const invited = await tx.engagement.count({ where: { workerId: actor.workerId, job: { orgId }, ...INVITATION } });
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

/**
 * Declines an invitation (or an offer); with `mute`, also mutes the
 * organization — only when what's declined is an invitation. `muted` says
 * whether the mute is now in place, so the message never claims one that
 * didn't happen. (Two steps: the decline stands even if the mute fails.)
 */
export async function declineInvitation(actor: WorkerActor, engagementId: string, opts: { mute?: boolean } = {}) {
  const e = UUID_RE.test(engagementId)
    ? await db().engagement.findFirst({ where: { id: engagementId, workerId: actor.workerId }, select: { status: true, job: { select: { orgId: true } } } })
    : null;
  const r = await moveEngagement(engagementId, "decline", { kind: "worker", ...actor });
  if (!r.ok || !opts.mute || e?.status !== "INVITED") return { ...r, muted: false };
  const m = await muteOrg(actor, e.job.orgId).catch(() => ({ ok: false as const, reason: "" }));
  return { ...r, muted: m.ok };
}

/**
 * One job's invitations from the organization's side (C3.3): who was
 * invited, by whom, with what note, and what happened. "Seen" is never
 * shown: there are no read receipts.
 */
export async function loadJobInvites(jobId: string, orgId: string) {
  const rows = await db().engagement.findMany({
    where: { jobId, job: { orgId }, ...INVITATION },
    select: {
      id: true, status: true, createdAt: true, inviteNote: true, inviteExpiresAt: true,
      worker: { select: { displayName: true } },
      job: { select: { status: true } },
      // Who sent it: the latest INVITED line's actor (the worker's contact can be reassigned later).
      events: { where: { type: "INVITED" }, orderBy: { createdAt: "desc" }, take: 1, select: { actorId: true, createdAt: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  const senderIds = [...new Set(rows.map((r) => r.events[0]?.actorId).filter((x): x is string => !!x))];
  const senders = new Map((await db().profile.findMany({ where: { id: { in: senderIds }, orgId } , select: { id: true, displayName: true } })).map((p) => [p.id, p.displayName]));
  return rows.map(({ events, ...r }) => ({ ...r, sentAt: events[0]?.createdAt ?? r.createdAt, sentBy: (events[0]?.actorId && senders.get(events[0].actorId)) || null }));
}

/** How many people sit under each hiring view of a job (the tabs): everyone is under exactly one. */
export async function hiringCounts(jobId: string, orgId: string) {
  // Total minus invitations, not NOT(INVITATION): SQL's NOT over a missing JSON key is null, which would drop rows.
  const [invites, total] = await Promise.all([
    db().engagement.count({ where: { jobId, job: { orgId }, ...INVITATION } }),
    db().engagement.count({ where: { jobId, job: { orgId } } }),
  ]);
  return { applicants: total - invites, invites };
}

/** Invitations this organization can still send this worker in the current rolling week (C3). */
export async function invitesLeft(workerId: string, orgId: string, now = new Date()) {
  const sent = await db().engagementEvent.count({
    where: { type: "INVITED", createdAt: { gt: new Date(now.getTime() - 7 * 86_400_000), lte: now }, engagement: { workerId, job: { orgId } } },
  });
  return Math.max(0, INVITES_PER_WEEK - sent);
}
