import { Prisma, type PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import type { Role } from "@/lib/auth";
import { UUID_RE } from "@/lib/jobs";
import {
  CHAT_STAFF_ROLES,
  EDIT_WINDOW_MS,
  canBlock,
  canCreateGroup,
  canDelete,
  canEdit,
  canManageMembers,
  canReport,
  canSend,
  chatAccess,
  cleanBody,
  validateGroupName,
  viewMessages,
  type Access,
  type ChatFacts,
  type RawRevision,
  type ViewMessage,
} from "@/lib/chat";
import { vetAttachment } from "@/lib/attachment-scan";
import { onMessageSent } from "@/lib/chat-hooks";
import { supabaseStore, type AttachmentStore } from "@/lib/chat-storage";

/**
 * M4 messaging data layer. Every read and write loads the conversation and
 * runs the rules in lib/chat.ts first; writes re-check under a
 * per-conversation lock. Nothing here reads political-fit answers.
 */

export interface ChatUser {
  userId: string;
  role: Role;
  orgId: string | null;
}

type Client = Prisma.TransactionClient | PrismaClient;
type Fail = { ok: false; reason: string };
const fail = (reason: string): Fail => ({ ok: false, reason });
const NOT_FOUND = fail("Conversation not found.");
const HIRED = ["ACTIVE", "CLAIMED"] as const;
const isHired = (s: string) => (HIRED as readonly string[]).includes(s);
export const THREAD_LIMIT = 200;

const lock = (tx: Prisma.TransactionClient, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

/**
 * Chat times come from the database clock — the same clock the access
 * triggers use for removals — so "sent before/after removal or a block"
 * never depends on app-server clock drift.
 */
async function dbNow(c: Client): Promise<Date> {
  const [row] = await c.$queryRaw<{ now: Date }[]>`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS "now"`;
  return row.now;
}

const PERSON = { select: { id: true, role: true, displayName: true, worker: { select: { displayName: true } } } } as const;
type Person = { role: string; displayName: string | null; worker: { displayName: string } | null };
const ROLE_LABEL: Record<string, string> = { OWNER: "Owner", RECRUITER: "Recruiter", SUPERVISOR: "Supervisor", COMPLIANCE: "Compliance", FINANCE: "Finance" };
/** Worker → their profile name; staff → their chat name, else their role. */
export const personName = (p: Person | null | undefined) => p?.worker?.displayName ?? p?.displayName ?? (p ? ROLE_LABEL[p.role] : undefined) ?? "Former member";

async function audit(c: Client, actorId: string, action: string, entityType: string, entityId: string, metadata: Prisma.InputJsonValue) {
  await c.auditEvent.create({ data: { actorId, action, entityType, entityId, metadata } });
}

// ---------------------------------------------------------------------------
// Loading a conversation + the caller's access
// ---------------------------------------------------------------------------

async function loadContext(c: Client, me: ChatUser, conversationId: string) {
  if (!UUID_RE.test(conversationId)) return null;
  const conv = await c.conversation.findUnique({
    where: { id: conversationId },
    include: {
      engagement: { select: { id: true, status: true, job: { select: { title: true } }, worker: { select: { profileId: true } } } },
      jobs: { select: { jobId: true, job: { select: { title: true } } } },
      participants: { include: { profile: PERSON }, orderBy: { addedAt: "asc" } },
    },
  });
  if (!conv) return null;
  const mine = conv.participants.find((p) => p.profileId === me.userId) ?? null;
  const facts: ChatFacts = {
    kind: conv.kind,
    orgId: conv.orgId,
    me: { profileId: me.userId, role: me.role, orgId: me.orgId },
    participant: mine ? { role: mine.role, removedAt: mine.removedAt } : null,
  };
  if (conv.kind === "DIRECT" && conv.engagement) {
    facts.engagementStatus = conv.engagement.status;
    facts.counterpartRemoved = conv.participants.some((p) => p.profileId !== me.userId && p.removedAt !== null);
    if (mine?.role === "MANAGER") {
      facts.blockedByOther = (await c.profileBlock.count({ where: { blockerId: conv.engagement.worker.profileId, blockedId: me.userId, liftedAt: null } })) > 0;
    }
  }
  if (conv.kind === "GROUP" && mine?.role === "WORKER" && !mine.removedAt) {
    facts.hiredOnLinkedJob =
      (await c.engagement.count({ where: { worker: { profileId: me.userId }, jobId: { in: conv.jobs.map((j) => j.jobId) }, status: { in: [...HIRED] } } })) > 0;
  }
  return { conv, mine, facts, access: chatAccess(facts) };
}

/** Messages as this viewer sees them: removal cutoff, blocks and revisions applied. */
async function loadView(c: Client, conversationId: string, viewerId: string, readUntil: Date | null, opts: { take?: number; ids?: string[] } = {}) {
  const rows = await c.message.findMany({
    where: { conversationId, ...(readUntil ? { createdAt: { lte: readUntil } } : {}), ...(opts.ids ? { id: { in: opts.ids } } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.take,
  });
  const [revisions, blocks] = await Promise.all([
    rows.length ? c.messageRevision.findMany({ where: { messageId: { in: rows.map((m) => m.id) } } }) : [],
    c.profileBlock.findMany({ where: { blockerId: viewerId } }),
  ]);
  const view = viewMessages(
    rows.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      body: m.body,
      createdAt: m.createdAt,
      attachment: m.attachmentPath ? { name: m.attachmentName ?? "file", type: m.attachmentType ?? "", size: m.attachmentSize ?? 0 } : null,
    })),
    revisions.map((r): RawRevision => ({ messageId: r.messageId, actorId: r.actorId, kind: r.kind, body: r.body, createdAt: r.createdAt })),
    viewerId,
    blocks,
    readUntil
  );
  return { view, rows, revisions, truncated: opts.take !== undefined && rows.length === opts.take };
}

// ---------------------------------------------------------------------------
// Thread list + unread
// ---------------------------------------------------------------------------

/** Unread per conversation: others' visible, undeleted messages after my last read. */
async function unreadByConversation(profileId: string): Promise<Map<string, number>> {
  const rows = await db().$queryRaw<{ conversationId: string; unread: number }[]>`
    SELECT p."conversationId"::text AS "conversationId", COUNT(m."id")::int AS "unread"
      FROM "ConversationParticipant" p
      JOIN "Message" m ON m."conversationId" = p."conversationId"
     WHERE p."profileId" = ${profileId}::uuid
       AND m."senderId" <> p."profileId"
       AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")
       AND (p."removedAt" IS NULL OR m."createdAt" <= p."removedAt")
       AND NOT EXISTS (SELECT 1 FROM "MessageRevision" r
                        WHERE r."messageId" = m."id" AND r."kind" = 'DELETE'
                          AND (p."removedAt" IS NULL OR r."createdAt" <= p."removedAt"))
       AND NOT EXISTS (SELECT 1 FROM "ProfileBlock" b
                        WHERE b."blockerId" = p."profileId" AND b."blockedId" = m."senderId"
                          AND b."createdAt" <= m."createdAt" AND (b."liftedAt" IS NULL OR m."createdAt" < b."liftedAt"))
     GROUP BY p."conversationId"`;
  return new Map(rows.map((r) => [r.conversationId, r.unread]));
}

/** For the nav badge. */
export async function unreadTotal(me: ChatUser): Promise<number> {
  let total = 0;
  for (const n of (await unreadByConversation(me.userId)).values()) total += n;
  return total;
}

export interface ThreadSummary {
  id: string;
  kind: "DIRECT" | "GROUP";
  title: string;
  subtitle: string;
  /** Read-only for me (removed, or the hire ended). */
  frozen: boolean;
  unread: number;
  last: { text: string; mine: boolean; at: Date } | null;
  /** For ordering: last message, else when the thread was created. */
  activeAt: Date;
}

export interface StartableDirect {
  engagementId: string;
  name: string;
  jobTitle: string;
}

function preview(m: ViewMessage): string {
  if (m.deleted) return "Message deleted";
  const text = (m.body ?? "").replace(/\s+/g, " ").trim();
  if (text) return text.length > 120 ? `${text.slice(0, 119)}…` : text;
  return m.attachment ? `Attachment: ${m.attachment.name}` : "";
}

export async function listThreads(me: ChatUser): Promise<{ threads: ThreadSummary[]; startable: StartableDirect[] }> {
  const rows = await db().conversationParticipant.findMany({
    where: { profileId: me.userId },
    include: {
      conversation: {
        include: {
          engagement: { select: { status: true, job: { select: { title: true } } } },
          jobs: { select: { job: { select: { title: true } } } },
          participants: { where: { profileId: { not: me.userId } }, include: { profile: PERSON } },
        },
      },
    },
  });
  const unread = await unreadByConversation(me.userId);
  const threads = await Promise.all(
    rows.map(async (row): Promise<ThreadSummary> => {
      const c = row.conversation;
      const { view } = await loadView(db(), c.id, me.userId, row.removedAt, { take: 10 });
      const last = view.at(-1);
      const direct = c.kind === "DIRECT";
      const other = direct ? c.participants[0] : undefined;
      return {
        id: c.id,
        kind: c.kind,
        title: direct ? personName(other?.profile) : (c.name ?? "Team chat"),
        subtitle: direct ? (c.engagement?.job.title ?? "") : c.jobs.map((j) => j.job.title).join(" · "),
        frozen: row.removedAt !== null || (direct && !isHired(c.engagement?.status ?? "")),
        unread: unread.get(c.id) ?? 0,
        last: last ? { text: preview(last), mine: last.senderId === me.userId, at: last.createdAt } : null,
        activeAt: last?.createdAt ?? c.createdAt,
      };
    })
  );
  threads.sort((a, b) => b.activeAt.getTime() - a.activeAt.getTime());
  return { threads, startable: await startableDirects(me) };
}

/** Hires with no direct thread yet — either side can start one. */
async function startableDirects(me: ChatUser): Promise<StartableDirect[]> {
  const base = { status: { in: [...HIRED] }, conversation: { is: null } } satisfies Prisma.EngagementWhereInput;
  if (me.role === "WORKER") {
    const rows = await db().engagement.findMany({
      where: { ...base, worker: { profileId: me.userId } },
      include: { job: { select: { title: true, org: { select: { name: true } } } }, hiredBy: PERSON },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((e) => ({ engagementId: e.id, name: e.hiredBy ? personName(e.hiredBy) : `${e.job.org.name} hiring manager`, jobTitle: e.job.title }));
  }
  if (!me.orgId || !CHAT_STAFF_ROLES.includes(me.role)) return [];
  const rows = await db().engagement.findMany({
    where: { ...base, hiredById: me.userId, job: { orgId: me.orgId } },
    include: { job: { select: { title: true } }, worker: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((e) => ({ engagementId: e.id, name: e.worker.displayName, jobTitle: e.job.title }));
}

// ---------------------------------------------------------------------------
// One thread
// ---------------------------------------------------------------------------

export interface ThreadMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderIsManager: boolean;
  mine: boolean;
  body: string | null;
  edited: boolean;
  deleted: boolean;
  createdAt: Date;
  attachment: { name: string; type: string; size: number } | null;
  canEdit: boolean;
  canDelete: boolean;
}
export interface ThreadMember {
  profileId: string;
  name: string;
  role: "WORKER" | "MANAGER";
  removed: boolean;
  isMe: boolean;
  /** I (a worker) have this manager blocked. */
  blockedByMe: boolean;
}
export interface ThreadView {
  id: string;
  kind: "DIRECT" | "GROUP";
  title: string;
  subtitle: string;
  access: Access;
  canManage: boolean;
  canBlock: boolean;
  members: ThreadMember[];
  messages: ThreadMessage[];
  /** More than THREAD_LIMIT messages: only the latest are shown. */
  hasOlder: boolean;
}

/** Opens a thread the caller participates in (and marks it read), or null. */
export async function openThread(me: ChatUser, conversationId: string): Promise<ThreadView | null> {
  const ctx = await loadContext(db(), me, conversationId);
  if (!ctx || !ctx.access.read || !ctx.mine) return null;
  const { conv, mine, access } = ctx;
  const { view, truncated } = await loadView(db(), conv.id, me.userId, access.readUntil, { take: THREAD_LIMIT });
  const myBlocks = new Set(
    (await db().profileBlock.findMany({ where: { blockerId: me.userId, liftedAt: null }, select: { blockedId: true } })).map((b) => b.blockedId)
  );
  const now = await dbNow(db());
  await db().conversationParticipant.update({ where: { id: mine.id }, data: { lastReadAt: now } });

  const byId = new Map(conv.participants.map((p) => [p.profileId, p]));
  const direct = conv.kind === "DIRECT";
  const other = direct ? conv.participants.find((p) => p.profileId !== me.userId) : undefined;
  return {
    id: conv.id,
    kind: conv.kind,
    title: direct ? personName(other?.profile) : (conv.name ?? "Team chat"),
    subtitle: direct ? (conv.engagement?.job.title ?? "") : conv.jobs.map((j) => j.job.title).join(" · "),
    access,
    canManage: canManageMembers(ctx.facts).ok,
    canBlock: me.role === "WORKER",
    members: conv.participants
      // Removed members stay listed for people who could see them go; a
      // removed viewer sees the roster as of their removal.
      .filter((p) => !mine.removedAt || p.addedAt <= mine.removedAt)
      .map((p) => ({
        profileId: p.profileId,
        name: personName(p.profile),
        role: p.role,
        removed: p.removedAt !== null && (!mine.removedAt || p.removedAt <= mine.removedAt),
        isMe: p.profileId === me.userId,
        blockedByMe: myBlocks.has(p.profileId),
      })),
    messages: view.map((m) => {
      const sender = byId.get(m.senderId);
      const mineMsg = m.senderId === me.userId;
      return {
        ...m,
        senderName: personName(sender?.profile),
        senderIsManager: sender?.role === "MANAGER",
        mine: mineMsg,
        canEdit: mineMsg && !m.deleted && !!m.body && access.post && now.getTime() - m.createdAt.getTime() <= EDIT_WINDOW_MS,
        canDelete: mineMsg && !m.deleted,
      };
    }),
    hasOlder: truncated,
  };
}

// ---------------------------------------------------------------------------
// Direct threads
// ---------------------------------------------------------------------------

/**
 * Who a worker's direct thread is with when no one is on record (instant
 * claims, older rows): the job's creator if still on staff, else the org's
 * first owner.
 */
export async function defaultBoss(c: Client, jobId: string, orgId: string): Promise<string | null> {
  const created = await c.auditEvent.findFirst({
    where: { action: "job.created", entityType: "Job", entityId: jobId },
    orderBy: { createdAt: "asc" },
    select: { actorId: true },
  });
  if (created?.actorId) {
    const p = await c.profile.findUnique({ where: { id: created.actorId }, select: { id: true, orgId: true, role: true } });
    if (p && p.orgId === orgId && CHAT_STAFF_ROLES.includes(p.role as Role)) return p.id;
  }
  const owner = await c.profile.findFirst({ where: { orgId, role: "OWNER" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return owner?.id ?? null;
}

/** The direct thread for a hire, created on first use. Only the worker and the person who hired them. */
export async function ensureDirect(me: ChatUser, engagementId: string): Promise<{ ok: true; conversationId: string } | Fail> {
  if (!UUID_RE.test(engagementId)) return NOT_FOUND;
  return db().$transaction(async (tx) => {
    await lock(tx, `conv:engagement:${engagementId}`);
    const e = await tx.engagement.findUnique({
      where: { id: engagementId },
      include: { job: { select: { orgId: true } }, worker: { select: { profileId: true } }, conversation: { select: { id: true } } },
    });
    if (!e) return NOT_FOUND;
    const isWorker = e.worker.profileId === me.userId;
    const isBoss = e.hiredById === me.userId && me.orgId === e.job.orgId && CHAT_STAFF_ROLES.includes(me.role);
    if (!isWorker && !isBoss) return NOT_FOUND;
    if (e.conversation) return { ok: true as const, conversationId: e.conversation.id };
    if (!isHired(e.status)) return fail("Messages unlock once the hire is confirmed.");

    // The boss must still run this org's teams; otherwise fall back.
    const boss = e.hiredById ? await tx.profile.findUnique({ where: { id: e.hiredById }, select: { id: true, orgId: true, role: true } }) : null;
    const stillStaff = !!boss && boss.orgId === e.job.orgId && CHAT_STAFF_ROLES.includes(boss.role as Role);
    const bossId = stillStaff ? boss.id : await defaultBoss(tx, e.jobId, e.job.orgId);
    if (!bossId) return fail("No one at this organization can be messaged yet.");
    if (bossId !== e.hiredById) await tx.engagement.update({ where: { id: e.id }, data: { hiredById: bossId } });
    if (bossId === e.worker.profileId) return fail("No one at this organization can be messaged yet.");
    const conv = await tx.conversation.create({
      data: {
        kind: "DIRECT",
        orgId: e.job.orgId,
        engagementId: e.id,
        createdById: me.userId,
        participants: {
          create: [
            { profileId: e.worker.profileId, role: "WORKER", addedById: me.userId },
            { profileId: bossId, role: "MANAGER", addedById: me.userId },
          ],
        },
      },
    });
    return { ok: true as const, conversationId: conv.id };
  });
}

// ---------------------------------------------------------------------------
// Send / edit / delete
// ---------------------------------------------------------------------------

export interface UploadedFile {
  name: string;
  bytes: Uint8Array;
}

export async function sendMessage(
  me: ChatUser,
  conversationId: string,
  rawBody: unknown,
  file: UploadedFile | null = null,
  store: AttachmentStore = supabaseStore()
): Promise<{ ok: true; messageId: string } | Fail> {
  const body = cleanBody(rawBody);
  // Cheap check before touching storage.
  const pre = await loadContext(db(), me, conversationId);
  if (!pre || !pre.access.read) return NOT_FOUND;
  const first = canSend(pre.access, body, file !== null);
  if (!first.ok) return first;

  let attachment: { path: string; name: string; type: string; size: number } | null = null;
  if (file) {
    const chk = vetAttachment({ name: file.name, size: file.bytes.length, bytes: file.bytes });
    if (!chk.ok) return chk;
    attachment = { path: `${pre.conv.orgId}/${pre.conv.id}/${crypto.randomUUID()}`, name: file.name, type: chk.type, size: file.bytes.length };
    await store.put(attachment.path, file.bytes, attachment.type);
  }

  let r: Fail | { ok: true; messageId: string; orgId: string; recipientIds: string[]; at: Date };
  try {
    r = await db().$transaction(async (tx) => {
      await lock(tx, `conv:${conversationId}`);
      const ctx = await loadContext(tx, me, conversationId);
      if (!ctx || !ctx.access.read || !ctx.mine) return NOT_FOUND;
      const ok = canSend(ctx.access, body, attachment !== null);
      if (!ok.ok) return ok;
      const at = await dbNow(tx);
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId: me.userId,
          body,
          attachmentPath: attachment?.path,
          attachmentName: attachment?.name,
          attachmentType: attachment?.type,
          attachmentSize: attachment?.size,
          createdAt: at,
        },
      });
      if (!ctx.conv.lastMessageAt || ctx.conv.lastMessageAt < at) await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: at } });
      await tx.conversationParticipant.update({ where: { id: ctx.mine.id }, data: { lastReadAt: at } });
      const others = ctx.conv.participants.filter((p) => p.profileId !== me.userId && !p.removedAt).map((p) => p.profileId);
      const blockers = new Set(
        (await tx.profileBlock.findMany({ where: { blockerId: { in: others }, blockedId: me.userId, liftedAt: null }, select: { blockerId: true } })).map((b) => b.blockerId)
      );
      return { ok: true as const, messageId: msg.id, orgId: ctx.conv.orgId, recipientIds: others.filter((id) => !blockers.has(id)), at };
    });
  } catch (e) {
    if (attachment) await store.remove(attachment.path);
    throw e;
  }
  if (!r.ok) {
    if (attachment) await store.remove(attachment.path);
    return r;
  }
  await onMessageSent({ messageId: r.messageId, conversationId, orgId: r.orgId, senderId: me.userId, recipientIds: r.recipientIds, at: r.at });
  return { ok: true, messageId: r.messageId };
}

/** Loads one message as the caller sees it, under the conversation lock. */
async function lockedMessage(tx: Prisma.TransactionClient, me: ChatUser, messageId: string) {
  if (!UUID_RE.test(messageId)) return null;
  const head = await tx.message.findUnique({ where: { id: messageId }, select: { conversationId: true } });
  if (!head) return null;
  await lock(tx, `conv:${head.conversationId}`);
  const ctx = await loadContext(tx, me, head.conversationId);
  if (!ctx) return null;
  // Participants see it through their window; others (an owner moderating)
  // see the stored message with its revisions.
  const readUntil = ctx.access.read ? ctx.access.readUntil : null;
  const { view, rows, revisions } = await loadView(tx, head.conversationId, me.userId, readUntil, { ids: [messageId] });
  return { ctx, msg: view[0] ?? null, row: rows[0] ?? null, revisions };
}

export async function editMessage(me: ChatUser, messageId: string, rawBody: unknown): Promise<{ ok: true } | Fail> {
  const body = cleanBody(rawBody);
  return db().$transaction(async (tx) => {
    const m = await lockedMessage(tx, me, messageId);
    if (!m || !m.ctx.access.read || !m.msg) return fail("Message not found.");
    const now = await dbNow(tx);
    const ok = canEdit(m.ctx.access, m.msg, me.userId, body, now);
    if (!ok.ok) return ok;
    await tx.messageRevision.create({ data: { messageId, conversationId: m.ctx.conv.id, kind: "EDIT", body, actorId: me.userId, createdAt: now } });
    return { ok: true as const };
  });
}

/** Soft delete (tombstone): the sender, or the org owner removing a reported message. */
export async function deleteMessage(me: ChatUser, messageId: string): Promise<{ ok: true } | Fail> {
  return db().$transaction(async (tx) => {
    const m = await lockedMessage(tx, me, messageId);
    if (!m || !m.msg) return fail("Message not found.");
    const reported = (await tx.messageReport.count({ where: { messageId } })) > 0;
    const ok = canDelete(m.ctx.access, m.msg, { profileId: me.userId, role: me.role, orgId: me.orgId }, m.ctx.conv.orgId, reported);
    if (!ok.ok) return ok.reason.startsWith("You can only") && !m.ctx.access.read ? fail("Message not found.") : ok;
    const now = await dbNow(tx);
    await tx.messageRevision.create({ data: { messageId, conversationId: m.ctx.conv.id, kind: "DELETE", actorId: me.userId, createdAt: now } });
    if (m.msg.senderId !== me.userId) {
      await tx.messageReport.updateMany({ where: { messageId, resolvedAt: null }, data: { resolvedAt: now, resolvedById: me.userId } });
      await audit(tx, me.userId, "message.removed", "Message", messageId, { conversationId: m.ctx.conv.id, reason: "reported" });
    }
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// Reports (to the org owner + audit log)
// ---------------------------------------------------------------------------

export async function reportMessage(me: ChatUser, messageId: string, rawReason: unknown): Promise<{ ok: true } | Fail> {
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  return db().$transaction(async (tx) => {
    const m = await lockedMessage(tx, me, messageId);
    if (!m || !m.ctx.access.read || !m.msg || !m.row) return fail("Message not found.");
    const ok = canReport(m.ctx.access, m.msg, me.userId, reason);
    if (!ok.ok) return ok;
    if (await tx.messageReport.findUnique({ where: { messageId_reporterId: { messageId, reporterId: me.userId } } })) {
      return fail("You've already reported this message.");
    }
    // The text as last written — kept even if it's later edited or deleted.
    const lastEdit = m.revisions.filter((r) => r.kind === "EDIT").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const text = lastEdit?.body ?? m.row.body;
    const snapshot = m.row.attachmentName ? `${text}${text ? "\n" : ""}[Attachment: ${m.row.attachmentName}]` : text;
    const report = await tx.messageReport.create({
      data: { messageId, conversationId: m.ctx.conv.id, orgId: m.ctx.conv.orgId, reporterId: me.userId, reason: reason.slice(0, 500), bodySnapshot: snapshot },
    });
    await audit(tx, me.userId, "message.reported", "Message", messageId, { conversationId: m.ctx.conv.id, reportId: report.id });
    return { ok: true as const };
  });
}

export interface OpenReport {
  id: string;
  messageId: string;
  conversationTitle: string;
  senderName: string;
  reporterName: string;
  reason: string;
  bodySnapshot: string;
  reportedAt: Date;
  sentAt: Date;
  deleted: boolean;
}

/** The org owner's queue. */
export async function listOpenReports(me: ChatUser): Promise<OpenReport[]> {
  if (me.role !== "OWNER" || !me.orgId) return [];
  const reports = await db().messageReport.findMany({
    where: { orgId: me.orgId, resolvedAt: null },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      message: {
        select: {
          createdAt: true,
          sender: PERSON,
          revisions: { where: { kind: "DELETE" }, select: { id: true }, take: 1 },
          conversation: { select: { kind: true, name: true, engagement: { select: { job: { select: { title: true } } } } } },
        },
      },
    },
  });
  const reporters = new Map(
    (await db().profile.findMany({ where: { id: { in: [...new Set(reports.map((r) => r.reporterId))] } }, select: PERSON.select })).map((p) => [p.id, p])
  );
  return reports.map((r) => {
    const conv = r.message.conversation;
    return {
      id: r.id,
      messageId: r.messageId,
      conversationTitle: conv.kind === "GROUP" ? (conv.name ?? "Team chat") : `Direct messages · ${conv.engagement?.job.title ?? ""}`,
      senderName: personName(r.message.sender),
      reporterName: personName(reporters.get(r.reporterId)),
      reason: r.reason,
      bodySnapshot: r.bodySnapshot,
      reportedAt: r.createdAt,
      sentAt: r.message.createdAt,
      deleted: r.message.revisions.length > 0,
    };
  });
}

/** Owner closes a report without removing the message. */
export async function dismissReport(me: ChatUser, reportId: string): Promise<{ ok: true } | Fail> {
  if (me.role !== "OWNER" || !me.orgId || !UUID_RE.test(reportId)) return fail("Report not found.");
  return db().$transaction(async (tx) => {
    const r = await tx.messageReport.findUnique({ where: { id: reportId } });
    if (!r || r.orgId !== me.orgId) return fail("Report not found.");
    if (r.resolvedAt) return { ok: true as const };
    await tx.messageReport.update({ where: { id: reportId }, data: { resolvedAt: await dbNow(tx), resolvedById: me.userId } });
    await audit(tx, me.userId, "report.dismissed", "MessageReport", reportId, { messageId: r.messageId });
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// Blocking (workers → employers/managers)
// ---------------------------------------------------------------------------

export async function blockProfile(me: ChatUser, targetId: string): Promise<{ ok: true } | Fail> {
  if (!UUID_RE.test(targetId) || targetId === me.userId) return fail("You don't share a conversation with that person.");
  const shared = { profileId: targetId, conversation: { participants: { some: { profileId: me.userId } } } } satisfies Prisma.ConversationParticipantWhereInput;
  const target =
    (await db().conversationParticipant.findFirst({ where: { ...shared, role: "MANAGER" }, select: { role: true } })) ??
    (await db().conversationParticipant.findFirst({ where: shared, select: { role: true } }));
  const ok = canBlock({ role: me.role }, target);
  if (!ok.ok) return ok;
  return db().$transaction(async (tx) => {
    await lock(tx, `block:${me.userId}:${targetId}`);
    if (await tx.profileBlock.findFirst({ where: { blockerId: me.userId, blockedId: targetId, liftedAt: null } })) return { ok: true as const };
    const b = await tx.profileBlock.create({ data: { blockerId: me.userId, blockedId: targetId, createdAt: await dbNow(tx) } });
    await audit(tx, me.userId, "profile.blocked", "ProfileBlock", b.id, { blockedId: targetId });
    return { ok: true as const };
  });
}

export async function unblockProfile(me: ChatUser, targetId: string): Promise<{ ok: true } | Fail> {
  if (!UUID_RE.test(targetId)) return fail("Not blocked.");
  return db().$transaction(async (tx) => {
    await lock(tx, `block:${me.userId}:${targetId}`);
    const b = await tx.profileBlock.findFirst({ where: { blockerId: me.userId, blockedId: targetId, liftedAt: null } });
    if (!b) return { ok: true as const };
    await tx.profileBlock.update({ where: { id: b.id }, data: { liftedAt: await dbNow(tx) } });
    await audit(tx, me.userId, "profile.unblocked", "ProfileBlock", b.id, { blockedId: targetId });
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// Team (group) chats
// ---------------------------------------------------------------------------

export interface Candidate {
  profileId: string;
  name: string;
  role: "WORKER" | "MANAGER";
  /** Workers: the team jobs they're hired on. Staff: their org role. */
  detail: string;
}

/** The org's jobs that can anchor a team chat (with at least one hire or open). */
export async function teamChatJobs(me: ChatUser) {
  if (!canCreateGroup(me).ok || !me.orgId) return [];
  return db().job.findMany({
    where: { orgId: me.orgId, status: { not: "DRAFT" } },
    select: { id: true, title: true, status: true, _count: { select: { engagements: { where: { status: { in: [...HIRED] } } } } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Who can be added to a team on these jobs: org staff, and workers hired on them. */
export async function teamCandidates(me: ChatUser, jobIds: string[], c: Client = db()): Promise<Candidate[]> {
  if (!me.orgId || !jobIds.every((id) => UUID_RE.test(id))) return [];
  const [staff, hires] = await Promise.all([
    c.profile.findMany({ where: { orgId: me.orgId, role: { in: CHAT_STAFF_ROLES } }, select: PERSON.select, orderBy: { createdAt: "asc" } }),
    c.engagement.findMany({
      where: { jobId: { in: jobIds }, job: { orgId: me.orgId }, status: { in: [...HIRED] } },
      select: { job: { select: { title: true } }, worker: { select: { profileId: true, displayName: true } } },
    }),
  ]);
  const workers = new Map<string, Candidate>();
  for (const h of hires) {
    const w = workers.get(h.worker.profileId);
    if (w) w.detail += ` · ${h.job.title}`;
    else workers.set(h.worker.profileId, { profileId: h.worker.profileId, name: h.worker.displayName, role: "WORKER", detail: h.job.title });
  }
  return [
    ...staff.map((p): Candidate => ({ profileId: p.id, name: personName(p), role: "MANAGER", detail: ROLE_LABEL[p.role] ?? p.role })),
    ...[...workers.values()].sort((a, b) => a.name.localeCompare(b.name)),
  ];
}

const uniqueIds = (raw: unknown, max: number): string[] | null => {
  if (!Array.isArray(raw) || raw.length > max || !raw.every((x) => typeof x === "string" && UUID_RE.test(x))) return null;
  return [...new Set(raw as string[])];
};

async function resolveMembers(c: Client, me: ChatUser, jobIds: string[], profileIds: string[]): Promise<Map<string, "WORKER" | "MANAGER"> | Fail> {
  const eligible = new Map((await teamCandidates(me, jobIds, c)).map((x) => [x.profileId, x.role]));
  const out = new Map<string, "WORKER" | "MANAGER">();
  for (const id of profileIds) {
    const role = eligible.get(id);
    if (!role) return fail("Add this organization's staff, or workers hired on the team's jobs.");
    out.set(id, role);
  }
  return out;
}

export async function createGroup(me: ChatUser, input: { name: unknown; jobIds: unknown; memberIds: unknown }): Promise<{ ok: true; conversationId: string } | Fail> {
  const may = canCreateGroup(me);
  if (!may.ok || !me.orgId) return may.ok ? fail("No organization on this account.") : may;
  const name = validateGroupName(input.name);
  if (!name.ok) return name;
  const jobIds = uniqueIds(input.jobIds, 20);
  if (!jobIds || jobIds.length === 0) return fail("Pick at least one job for this team.");
  const memberIds = uniqueIds(input.memberIds, 200);
  if (!memberIds) return fail("Pick the team's members.");
  const orgId = me.orgId;

  return db().$transaction(async (tx) => {
    if ((await tx.job.count({ where: { id: { in: jobIds }, orgId } })) !== jobIds.length) return fail("Pick jobs from your organization.");
    const members = await resolveMembers(tx, me, jobIds, memberIds.filter((id) => id !== me.userId));
    if ("ok" in members) return members;
    members.set(me.userId, "MANAGER");
    const conv = await tx.conversation.create({
      data: {
        kind: "GROUP",
        orgId,
        name: name.name,
        createdById: me.userId,
        jobs: { create: jobIds.map((jobId) => ({ jobId })) },
        participants: { create: [...members].map(([profileId, role]) => ({ profileId, role, addedById: me.userId })) },
      },
    });
    await audit(tx, me.userId, "conversation.created", "Conversation", conv.id, { kind: "GROUP", jobIds, members: members.size });
    return { ok: true as const, conversationId: conv.id };
  });
}

export async function addMembers(me: ChatUser, conversationId: string, rawIds: unknown): Promise<{ ok: true; added: number } | Fail> {
  const ids = uniqueIds(rawIds, 200);
  if (!ids || ids.length === 0) return fail("Pick someone to add.");
  return db().$transaction(async (tx) => {
    if (!UUID_RE.test(conversationId)) return NOT_FOUND;
    await lock(tx, `conv:${conversationId}`);
    const ctx = await loadContext(tx, me, conversationId);
    if (!ctx) return NOT_FOUND;
    const may = canManageMembers(ctx.facts);
    if (!may.ok) return ctx.access.read ? may : NOT_FOUND;
    const members = await resolveMembers(tx, me, ctx.conv.jobs.map((j) => j.jobId), ids);
    if ("ok" in members) return members;
    const now = await dbNow(tx);
    let added = 0;
    for (const [profileId, role] of members) {
      const existing = ctx.conv.participants.find((p) => p.profileId === profileId);
      if (existing && !existing.removedAt) continue;
      // Re-adding someone gives them the team's full history, like any new member.
      if (existing) {
        await tx.conversationParticipant.update({
          where: { id: existing.id },
          data: { role, removedAt: null, removedById: null, addedAt: now, addedById: me.userId, lastReadAt: null },
        });
      } else {
        await tx.conversationParticipant.create({ data: { conversationId, profileId, role, addedById: me.userId, addedAt: now } });
      }
      await audit(tx, me.userId, "conversation.member_added", "Conversation", conversationId, { profileId, role });
      added++;
    }
    return { ok: true as const, added };
  });
}

/** Removed members keep read-only history up to now. */
export async function removeMember(me: ChatUser, conversationId: string, profileId: string): Promise<{ ok: true } | Fail> {
  if (!UUID_RE.test(conversationId) || !UUID_RE.test(profileId)) return NOT_FOUND;
  return db().$transaction(async (tx) => {
    await lock(tx, `conv:${conversationId}`);
    const ctx = await loadContext(tx, me, conversationId);
    if (!ctx) return NOT_FOUND;
    const may = canManageMembers(ctx.facts);
    if (!may.ok) return ctx.access.read ? may : NOT_FOUND;
    const target = ctx.conv.participants.find((p) => p.profileId === profileId && !p.removedAt);
    if (!target) return fail("That person isn't in this team chat.");
    await tx.conversationParticipant.update({ where: { id: target.id }, data: { removedAt: await dbNow(tx), removedById: me.userId } });
    await audit(tx, me.userId, "conversation.member_removed", "Conversation", conversationId, { profileId });
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// Attachments + names
// ---------------------------------------------------------------------------

/** A 60-second download link for a message's file, if the caller can see it. */
export async function attachmentLink(me: ChatUser, messageId: string, store: AttachmentStore = supabaseStore()): Promise<string | null> {
  if (!UUID_RE.test(messageId)) return null;
  const head = await db().message.findUnique({ where: { id: messageId }, select: { conversationId: true, attachmentPath: true, attachmentName: true } });
  if (!head?.attachmentPath) return null;
  const ctx = await loadContext(db(), me, head.conversationId);
  if (!ctx || !ctx.access.read) return null;
  const { view } = await loadView(db(), head.conversationId, me.userId, ctx.access.readUntil, { ids: [messageId] });
  if (!view[0] || view[0].deleted) return null;
  return store.signedUrl(head.attachmentPath, head.attachmentName ?? "attachment");
}

/** Staff set the name people see in chat. Workers use their profile name. */
export async function setChatName(me: ChatUser, raw: unknown): Promise<{ ok: true } | Fail> {
  if (me.role === "WORKER") return fail("Workers use their profile name.");
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (name.length > 60) return fail("Keep your name under 60 characters.");
  await db().profile.update({ where: { id: me.userId }, data: { displayName: name || null } });
  return { ok: true };
}
