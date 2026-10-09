import type { NotificationKind, Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { HIRING_ROLES } from "@/lib/access";
import type { EngagementEventType } from "@/lib/engagements";
import { exclusionReasons, readDisclosure, UUID_RE } from "@/lib/jobs";
import { effectivePreference } from "@/lib/political-fit";
import { loadLatestPreference } from "@/lib/political-fit-data";

type Tx = Prisma.TransactionClient;

/**
 * In-app notices for hiring steps (C3.5). Each row stores only who it's for,
 * what kind of step and which engagement; the words are drawn when it's
 * shown, from what the recipient may see then. Whether someone read a notice
 * is theirs alone: nothing shows it to anyone else (no read receipts).
 */

/**
 * Who on the organization's side hears about a step: the engagement's
 * contact while they're still hiring staff there, else its hiring staff.
 */
async function orgRecipients(tx: Tx, orgId: string, contactId: string | null): Promise<string[]> {
  if (contactId) {
    const c = await tx.profile.findFirst({ where: { id: contactId, orgId, role: { in: HIRING_ROLES }, closedAt: null }, select: { id: true } });
    if (c) return [c.id];
  }
  const staff = await tx.profile.findMany({ where: { orgId, role: { in: HIRING_ROLES }, closedAt: null }, select: { id: true } });
  return staff.map((s) => s.id);
}

/** The notice a history step sends, and to which side. */
const FOR_EVENT: Partial<Record<EngagementEventType, { kind: NotificationKind; to: "worker" | "org" }>> = {
  APPLIED: { kind: "APPLICATION_RECEIVED", to: "org" },
  CLAIMED: { kind: "CLAIM_RECEIVED", to: "org" },
  INVITED: { kind: "INVITATION_RECEIVED", to: "worker" },
  INVITE_ACCEPTED: { kind: "INVITATION_ACCEPTED", to: "org" },
  INVITE_DECLINED: { kind: "INVITATION_DECLINED", to: "org" },
  INVITE_WITHDRAWN: { kind: "INVITATION_WITHDRAWN", to: "worker" },
  OFFERED: { kind: "OFFER_RECEIVED", to: "worker" },
  OFFER_ACCEPTED: { kind: "OFFER_ACCEPTED", to: "org" },
  OFFER_DECLINED: { kind: "OFFER_DECLINED", to: "org" },
  NOT_SELECTED: { kind: "NOT_SELECTED", to: "worker" },
  WITHDRAWN: { kind: "APPLICATION_WITHDRAWN", to: "org" },
  // IN_REVIEW stays quiet: the worker sees it on the job, without a ping per step.
};

/**
 * Writes the notice for one history step, in the same transaction. Never to
 * the person who took the step, and never to a closed account.
 */
export async function notifyStep(
  tx: Tx,
  step: EngagementEventType,
  e: { id: string; hiredById: string | null; worker: { profileId: string; closedAt: Date | null }; job: { orgId: string } },
  actorId: string | null,
  at: Date,
  kind?: NotificationKind
) {
  const rule = FOR_EVENT[step];
  if (!rule) return;
  const to = rule.to === "worker" ? (e.worker.closedAt ? [] : [e.worker.profileId]) : await orgRecipients(tx, e.job.orgId, e.hiredById);
  const recipients = to.filter((id) => id !== actorId);
  if (!recipients.length) return;
  await tx.notification.createMany({ data: recipients.map((recipientId) => ({ recipientId, kind: kind ?? rule.kind, engagementId: e.id, createdAt: at })) });
}

export const NOTIFICATION_PAGE = 50;
/** The badge shows "99+" past this: counting further would only cost time. */
export const UNREAD_CAP = 100;

type Viewer = { userId: string; role: Role; workerId: string | null; orgId: string | null };

/**
 * Which engagements a person's notices may be about now: a worker's own, or
 * — for hiring staff only — the jobs of the organization they belong to now
 * (staff who left or moved to another role see none of its applicants).
 */
function scopeFor(v: Viewer): Prisma.EngagementWhereInput | null {
  if (v.role === "WORKER") return v.workerId ? { workerId: v.workerId } : null;
  return v.orgId && HIRING_ROLES.includes(v.role) ? { job: { orgId: v.orgId } } : null;
}

const SELECT = {
  id: true, kind: true, createdAt: true, readAt: true,
  engagement: {
    select: {
      id: true, jobId: true, status: true,
      worker: { select: { displayName: true } },
      job: { select: { title: true, campaignDisclosure: true, measureIds: true, org: { select: { name: true } } } },
      // Whether it ever was an offer, for the words of a job-closed notice.
      events: { where: { type: "OFFERED" as const }, take: 1, select: { id: true } },
    },
  },
} satisfies Prisma.NotificationSelect;

/**
 * A worker's notices about invitations their own do-not-match answers now rule
 * out are never shown, as the invitation itself never is (rule 4).
 */
async function visible<T extends { kind: NotificationKind; engagement: { status: string; job: { campaignDisclosure: unknown; measureIds: string[]; org: { name: string } } } }>(
  v: Viewer,
  rows: T[]
): Promise<T[]> {
  if (v.role !== "WORKER" || !v.workerId || !rows.length) return rows;
  const pref = effectivePreference(await loadLatestPreference(v.workerId));
  const invitation = (r: T) =>
    r.kind === "INVITATION_RECEIVED" || r.kind === "INVITATION_WITHDRAWN" || (r.kind === "JOB_CLOSED" && r.engagement.status === "WITHDRAWN");
  return rows.filter(
    (r) => !invitation(r) || !exclusionReasons(pref, { disclosure: readDisclosure(r.engagement.job.campaignDisclosure), orgName: r.engagement.job.org.name, measureIds: r.engagement.job.measureIds }).length
  );
}

/** A person's notices, newest first, each with what it's about. */
export async function loadNotifications(v: Viewer) {
  const scope = scopeFor(v);
  if (!scope) return [];
  const rows = await db().notification.findMany({ where: { recipientId: v.userId, engagement: scope }, select: SELECT, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: NOTIFICATION_PAGE });
  return visible(v, rows);
}

/** Unread notices (up to UNREAD_CAP) for the header bell. */
export async function unreadNotifications(v: Viewer): Promise<number> {
  const scope = scopeFor(v);
  if (!scope) return 0;
  const rows = await db().notification.findMany({
    where: { recipientId: v.userId, readAt: null, engagement: scope },
    select: SELECT,
    orderBy: { createdAt: "desc" },
    take: UNREAD_CAP,
  });
  return (await visible(v, rows)).length;
}

/**
 * Marks read the notices this person was shown (their ids, from the page) —
 * never ones that arrived after, sat beyond the page, or aren't theirs.
 * Nobody else ever sees whether they did.
 */
export async function markRead(userId: string, ids: string[], now = new Date()) {
  const own = ids.filter((id) => UUID_RE.test(id)).slice(0, NOTIFICATION_PAGE);
  if (!own.length) return;
  await db().notification.updateMany({ where: { recipientId: userId, id: { in: own }, readAt: null }, data: { readAt: now } });
}
