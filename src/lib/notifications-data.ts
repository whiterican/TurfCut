import type { NotificationKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HIRING_ROLES } from "@/lib/access";
import type { EngagementEventType } from "@/lib/engagements";

type Tx = Prisma.TransactionClient;

/**
 * In-app notices for hiring steps (C3.5). Each row stores only who it's for,
 * what kind of step and which engagement; the words are drawn when it's
 * shown, from what the recipient may see then. Whether someone read a notice
 * is theirs alone: nothing shows it to anyone else (no read receipts).
 */

/** Who on the organization's side hears about a step: the engagement's contact, else its hiring staff. */
async function orgRecipients(tx: Tx, orgId: string, contactId: string | null): Promise<string[]> {
  if (contactId) {
    const c = await tx.profile.findFirst({ where: { id: contactId, orgId, closedAt: null }, select: { id: true } });
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

/**
 * A person's notices, newest first, each with what it's about — only ones
 * that still concern them: a worker's own engagements, or engagements on the
 * jobs of the organization they belong to now (staff who left see none).
 */
export async function loadNotifications(viewer: { userId: string; workerId: string | null; orgId: string | null }) {
  const scope: Prisma.EngagementWhereInput = viewer.workerId ? { workerId: viewer.workerId } : viewer.orgId ? { job: { orgId: viewer.orgId } } : { id: "00000000-0000-0000-0000-000000000000" };
  return db().notification.findMany({
    where: { recipientId: viewer.userId, engagement: scope },
    select: {
      id: true, kind: true, createdAt: true, readAt: true,
      engagement: { select: { id: true, jobId: true, worker: { select: { displayName: true } }, job: { select: { title: true, org: { select: { name: true } } } } } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: NOTIFICATION_PAGE,
  });
}

export async function unreadNotifications(viewer: { userId: string; workerId: string | null; orgId: string | null }): Promise<number> {
  const scope: Prisma.EngagementWhereInput = viewer.workerId ? { workerId: viewer.workerId } : viewer.orgId ? { job: { orgId: viewer.orgId } } : { id: "00000000-0000-0000-0000-000000000000" };
  return db().notification.count({ where: { recipientId: viewer.userId, readAt: null, engagement: scope } });
}

/** Marks every notice of this person read (their own; nobody else ever sees it). */
export async function markAllRead(userId: string, now = new Date()) {
  await db().notification.updateMany({ where: { recipientId: userId, readAt: null }, data: { readAt: now } });
}
