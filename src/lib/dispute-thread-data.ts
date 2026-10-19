/**
 * The dispute thread and its clock (M9): the worker and the organization's
 * pay roles write to each other under a dispute; two deadlines run from the
 * moment it opens; a missed one is flagged on both sides and the pay roles
 * are told. Resolving stays in pay-data (the money rules live there).
 */
import { Prisma, type NotificationKind } from "@prisma/client";
import { db } from "@/lib/db";
import { PAY_ROLES } from "@/lib/access";
import type { Role } from "@/lib/auth";
import { UUID_RE } from "@/lib/jobs";
import { hasHiddenChars } from "@/lib/text-guard";
import { disputeClock, type DisputeClock } from "@/lib/dispute-sla";

type Tx = Prisma.TransactionClient;
type Client = Tx | ReturnType<typeof db>;
type Fail = { ok: false; reason: string };

const lock = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

export const DISPUTE_MESSAGE_MAX = 2000;

/** Who may act on a dispute: the worker it belongs to, or an owner or finance member of its organization. */
export interface DisputeActor {
  profileId: string;
  role: Role;
  orgId: string | null;
  workerId: string | null;
}

const payRole = (a: { role: Role; orgId: string | null }) => !!a.orgId && PAY_ROLES.includes(a.role);

/** The organization's pay roles with a live login, minus the person acting. */
async function payRecipients(c: Client, orgId: string, except: string | null) {
  const rows = await c.profile.findMany({ where: { orgId, role: { in: PAY_ROLES }, closedAt: null, ...(except ? { id: { not: except } } : {}) }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** One notice per recipient about a dispute; `to` picks the side. Never the person who acted. */
export async function notifyDispute(
  c: Client,
  kind: NotificationKind,
  d: { id: string; orgId: string; worker: { profileId: string } },
  to: "worker" | "org",
  actorId: string | null,
  at: Date
) {
  const recipients = to === "worker" ? (d.worker.profileId === actorId ? [] : [d.worker.profileId]) : await payRecipients(c, d.orgId, actorId);
  if (!recipients.length) return;
  await c.notification.createMany({ data: recipients.map((recipientId) => ({ recipientId, kind, disputeId: d.id, createdAt: at })) });
}

/** The clock from a dispute's rows: the organization's first message is any not written by the worker. */
export function clockOf(d: { createdAt: Date; worker: { profileId: string }; messages: Array<{ authorId: string; createdAt: Date }>; resolution: { createdAt: Date } | null }, now: Date): DisputeClock {
  const firstOrg = d.messages.filter((m) => m.authorId !== d.worker.profileId).map((m) => m.createdAt).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return disputeClock({ openedAt: d.createdAt, firstOrgReplyAt: firstOrg, resolvedAt: d.resolution?.createdAt ?? null }, now);
}

const THREAD_INCLUDE = {
  worker: { select: { id: true, displayName: true, profileId: true } },
  resolution: { select: { outcome: true, response: true, createdAt: true, resolvedById: true } },
  messages: { orderBy: { createdAt: "asc" as const }, select: { id: true, body: true, createdAt: true, authorId: true, author: { select: { displayName: true, role: true } } } },
  shift: { select: { id: true, startsAt: true, supervisorId: true, engagement: { select: { job: { select: { id: true, title: true, org: { select: { name: true } } } } } } } },
} satisfies Prisma.PayDisputeInclude;

export type DisputeSide = "worker" | "org";

export interface ThreadView {
  id: string;
  reason: string;
  createdAt: Date;
  worker: { name: string };
  job: { id: string; title: string; orgName: string };
  shift: { id: string; startsAt: Date };
  resolution: { outcome: string; response: string; createdAt: Date } | null;
  messages: Array<{ id: string; body: string; createdAt: Date; side: DisputeSide; mine: boolean; author: string }>;
  clock: DisputeClock;
  /** What this viewer is to the dispute. */
  viewer: DisputeSide;
  /** Writing needs the dispute open, and the worker or a pay role (a supervisor only reads). */
  canWrite: boolean;
  canResolve: boolean;
}

const ROLE_WORDS: Partial<Record<Role, string>> = { OWNER: "Owner", FINANCE: "Finance", RECRUITER: "Recruiter", SUPERVISOR: "Supervisor", COMPLIANCE: "Compliance", PUBLISHER: "Publisher" };

/**
 * The thread as one person may see it: the worker, the organization's pay
 * roles, and the shift's supervisor (who reads, and may be asked to
 * re-review). Anyone else: null, as if it didn't exist.
 */
export async function loadDisputeThread(actor: DisputeActor, disputeId: string, now = new Date()): Promise<ThreadView | null> {
  if (!UUID_RE.test(disputeId)) return null;
  const d = await db().payDispute.findUnique({ where: { id: disputeId }, include: THREAD_INCLUDE });
  if (!d) return null;
  const isWorker = actor.role === "WORKER" && actor.workerId === d.workerId && actor.profileId === d.worker.profileId;
  const isPay = payRole(actor) && actor.orgId === d.orgId;
  const isSupervisor = !!actor.orgId && actor.orgId === d.orgId && d.shift.supervisorId === actor.profileId;
  if (!isWorker && !isPay && !isSupervisor) return null;
  const open = !d.resolution;
  return {
    id: d.id,
    reason: d.reason,
    createdAt: d.createdAt,
    worker: { name: d.worker.displayName },
    job: { id: d.shift.engagement.job.id, title: d.shift.engagement.job.title, orgName: d.shift.engagement.job.org.name },
    shift: { id: d.shift.id, startsAt: d.shift.startsAt },
    resolution: d.resolution ? { outcome: d.resolution.outcome, response: d.resolution.response, createdAt: d.resolution.createdAt } : null,
    messages: d.messages.map((m) => {
      const side: DisputeSide = m.authorId === d.worker.profileId ? "worker" : "org";
      // The organization's people are named by role to the worker, as on the Pay tab; the worker by display name.
      const author = side === "worker" ? d.worker.displayName : `${m.author.displayName ?? d.shift.engagement.job.org.name} · ${ROLE_WORDS[m.author.role] ?? "Staff"}`;
      return { id: m.id, body: m.body, createdAt: m.createdAt, side, mine: m.authorId === actor.profileId, author };
    }),
    clock: clockOf(d, now),
    viewer: isWorker ? "worker" : "org",
    canWrite: open && (isWorker || isPay),
    canResolve: open && isPay,
  };
}

/** A message in the thread, from the worker or a pay role, while the dispute is open. The other side is told. */
export async function postDisputeMessage(actor: DisputeActor, disputeId: string, rawBody: unknown, now = new Date()): Promise<{ ok: true } | Fail> {
  if (!UUID_RE.test(disputeId)) return { ok: false, reason: "Dispute not found." };
  const body = (typeof rawBody === "string" ? rawBody : "").replace(/\r\n/g, "\n").trim();
  if (!body) return { ok: false, reason: "Write a message." };
  if (body.length > DISPUTE_MESSAGE_MAX) return { ok: false, reason: `Keep it under ${DISPUTE_MESSAGE_MAX.toLocaleString("en-US")} characters.` };
  if (hasHiddenChars(body)) return { ok: false, reason: "The message has a character that can't be shown. Retype it rather than pasting." };
  return db().$transaction(async (tx) => {
    await lock(tx, `dispute:${disputeId}`);
    const d = await tx.payDispute.findUnique({ where: { id: disputeId }, select: { id: true, orgId: true, workerId: true, worker: { select: { profileId: true, closedAt: true } }, resolution: { select: { id: true } } } });
    if (!d) return { ok: false as const, reason: "Dispute not found." };
    const isWorker = actor.role === "WORKER" && actor.workerId === d.workerId && actor.profileId === d.worker.profileId;
    const isPay = payRole(actor) && actor.orgId === d.orgId;
    if (!isWorker && !isPay) return { ok: false as const, reason: "Dispute not found." };
    if (d.resolution) return { ok: false as const, reason: "This dispute is closed. Open a new one from Earnings if something is still wrong." };
    if (isWorker && d.worker.closedAt) return { ok: false as const, reason: "Your account is closed." };
    await tx.payDisputeMessage.create({ data: { disputeId, authorId: actor.profileId, body, createdAt: now } });
    await notifyDispute(tx, "DISPUTE_MESSAGE", { id: d.id, orgId: d.orgId, worker: { profileId: d.worker.profileId } }, isWorker ? "org" : "worker", actor.profileId, now);
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "pay.dispute_message", entityType: "PayDispute", entityId: disputeId, metadata: { side: isWorker ? "WORKER" : "ORG", length: body.length }, createdAt: now } });
    return { ok: true as const };
  });
}

const OVERDUE_INCLUDE = {
  worker: { select: { profileId: true } },
  resolution: { select: { createdAt: true } },
  messages: { select: { authorId: true, createdAt: true } },
  notices: { where: { kind: "DISPUTE_OVERDUE" as const }, select: { id: true }, take: 1 },
} satisfies Prisma.PayDisputeInclude;

/**
 * Tells the pay roles about disputes that have gone overdue since anyone
 * looked: once per dispute, the first time a deadline is seen to be missed.
 * There is no scheduler, so this runs when the Pay tab or the Desk loads;
 * the flags on the pages themselves come from the clock and never wait on it.
 */
export async function noteOverdueDisputes(orgId: string, now = new Date()): Promise<number> {
  const open = await db().payDispute.findMany({ where: { orgId, resolution: { is: null } }, include: OVERDUE_INCLUDE });
  const due = open.filter((d) => !d.notices.length && clockOf(d, now).overdue);
  let sent = 0;
  for (const d of due) {
    await db().$transaction(async (tx) => {
      await lock(tx, `dispute:${d.id}`);
      if (await tx.notification.count({ where: { disputeId: d.id, kind: "DISPUTE_OVERDUE" } })) return;
      await notifyDispute(tx, "DISPUTE_OVERDUE", { id: d.id, orgId, worker: { profileId: d.worker.profileId } }, "org", null, now);
      await tx.auditEvent.create({ data: { actorId: null, action: "pay.dispute_overdue", entityType: "PayDispute", entityId: d.id, metadata: {}, createdAt: now } });
      sent++;
    });
  }
  return sent;
}

/** The Desk's numbers: open disputes, how many are due today (UTC) and how many are overdue. */
export async function disputeCounts(orgId: string, now = new Date()): Promise<{ open: number; dueToday: number; overdue: number }> {
  const open = await db().payDispute.findMany({ where: { orgId, resolution: { is: null } }, include: { worker: { select: { profileId: true } }, resolution: { select: { createdAt: true } }, messages: { select: { authorId: true, createdAt: true } } } });
  const today = now.toISOString().slice(0, 10);
  let dueToday = 0;
  let overdue = 0;
  for (const d of open) {
    const c = clockOf(d, now);
    if (c.overdue) overdue++;
    else if (c.next && c.next.due.toISOString().slice(0, 10) === today) dueToday++;
  }
  return { open: open.length, dueToday, overdue };
}
