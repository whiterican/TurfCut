import { Prisma, type PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import type { Role } from "@/lib/auth";
import { canUse, type Grants } from "@/lib/access";
import { areaMembers } from "@/lib/access-data";
import { UUID_RE } from "@/lib/jobs";
import {
  EDIT_WINDOW_MS,
  GENERAL_CHANNEL,
  canBlock,
  canCreateGroup,
  canJoinChannel,
  canLeaveChannel,
  canManageChannels,
  isChannelStaff,
  REACTIONS,
  canDelete,
  canEdit,
  canManageMembers,
  canReact,
  canReply,
  canReport,
  canSend,
  chatAccess,
  cleanBody,
  validateChannelName,
  validateChannelTopic,
  validateGroupName,
  viewMessages,
  type Access,
  type ChannelFacts,
  type ChatFacts,
  type ParticipantRole,
  type Reaction,
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
  /** A custom-role member's grants (M10.6). */
  grants?: Grants | null;
  orgId: string | null;
}

/** Whether a profile still runs teams in the organization: the messages area, by built-in role or custom grant (M10.6). */
const runsTeams = async (c: Client, profileId: string, orgId: string): Promise<boolean> => (await c.profile.count({ where: { id: profileId, orgId, closedAt: null, ...areaMembers("messages") } })) > 0;

type Client = Prisma.TransactionClient | PrismaClient;
type Fail = { ok: false; reason: string };
const fail = (reason: string): Fail => ({ ok: false, reason });
const NOT_FOUND = fail("Conversation not found.");
const HIRED = ["ACTIVE", "CLAIMED"] as const;
const isHired = (s: string) => (HIRED as readonly string[]).includes(s);
export const THREAD_LIMIT = 200;

const lock = (tx: Prisma.TransactionClient, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

/**
 * Chat times come from the database's wall clock (clock_timestamp) — the
 * same clock the access triggers use for removals — so "sent before/after
 * removal or a block" never depends on app-server clock drift.
 */
async function dbNow(c: Client): Promise<Date> {
  const [row] = await c.$queryRaw<{ now: Date }[]>`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS "now"`;
  return row.now;
}

const PERSON = { select: { id: true, role: true, displayName: true, worker: { select: { displayName: true } }, orgRole: { select: { name: true } } } } as const;
type Person = { role: string; displayName: string | null; worker: { displayName: string } | null; orgRole?: { name: string } | null };
const ROLE_LABEL: Record<string, string> = { OWNER: "Owner", RECRUITER: "Recruiter", SUPERVISOR: "Supervisor", COMPLIANCE: "Compliance", FINANCE: "Finance", PUBLISHER: "Publisher" };
/** Worker → their profile name; staff → their chat name, else their role. */
export const personName = (p: Person | null | undefined) => p?.worker?.displayName ?? p?.displayName ?? (p ? (p.role === "CUSTOM" ? "Team member" : ROLE_LABEL[p.role]) : undefined) ?? "Former member";

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
    me: { profileId: me.userId, role: me.role, grants: me.grants, orgId: me.orgId },
    participant: mine ? { role: mine.role, removedAt: mine.removedAt, addedAt: mine.addedAt } : null,
    archived: conv.archivedAt !== null,
  };
  if (conv.kind === "DIRECT" && conv.engagement) {
    facts.engagementStatus = conv.engagement.status;
    facts.counterpartRemoved = !conv.participants.some((p) => p.profileId !== me.userId && p.removedAt === null);
    if (mine?.role === "MANAGER") {
      facts.blockedByOther = (await c.profileBlock.count({ where: { blockerId: conv.engagement.worker.profileId, blockedId: me.userId, liftedAt: null } })) > 0;
    }
  }
  if (conv.kind !== "DIRECT" && mine?.role === "WORKER" && !mine.removedAt) {
    facts.hiredOnLinkedJob =
      (await c.engagement.count({ where: { worker: { profileId: me.userId }, jobId: { in: conv.jobs.map((j) => j.jobId) }, status: { in: [...HIRED] } } })) > 0;
  }
  return { conv, mine, facts, access: chatAccess(facts) };
}

/** Messages as this viewer sees them: removal cutoff, blocks and revisions applied. */
async function loadView(
  c: Client,
  conversationId: string,
  viewerId: string,
  window: { readUntil: Date | null; readFrom: Date | null },
  /**
   * `thread`: null for the main conversation only (no replies), a message id for that message's replies; left out for everything.
   * `repliesOnly`: every reply, whatever its thread. `since`: nothing older than this.
   */
  opts: { take?: number; ids?: string[]; thread?: string | null; repliesOnly?: boolean; since?: Date } = {}
) {
  const { readUntil, readFrom } = window;
  const rows = await c.message.findMany({
    where: {
      conversationId,
      ...(readUntil || readFrom || opts.since ? { createdAt: { ...(readUntil ? { lte: readUntil } : {}), ...(readFrom || opts.since ? { gte: [readFrom, opts.since].reduce<Date | undefined>((a, b) => (b && (!a || b > a) ? b : a), undefined) } : {}) } } : {}),
      ...(opts.ids ? { id: { in: opts.ids } } : {}),
      ...(opts.thread !== undefined ? { parentId: opts.thread } : opts.repliesOnly ? { parentId: { not: null } } : {}),
    },
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
      parentId: m.parentId,
    })),
    revisions.map((r): RawRevision => ({ messageId: r.messageId, actorId: r.actorId, kind: r.kind, body: r.body, createdAt: r.createdAt })),
    viewerId,
    blocks,
    readUntil,
    readFrom
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
       AND (p."role" = 'WORKER' OR m."createdAt" >= p."addedAt"
            OR NOT EXISTS (SELECT 1 FROM "Conversation" cv WHERE cv."id" = p."conversationId" AND cv."kind" = 'DIRECT'))
       -- A staff row in a channel counts only while I'm on that organization's staff: afterwards the
       -- channel is hidden from me (lib/chat.ts), so its messages must not hold a badge I could never clear.
       AND (p."role"::text <> 'MEMBER' OR EXISTS (
              SELECT 1 FROM "Profile" pr JOIN "Conversation" cv ON cv."id" = p."conversationId"
               WHERE pr."id" = p."profileId" AND pr."orgId" = cv."orgId" AND pr."role"::text <> 'WORKER'))
       -- A deletion carries no content, so it counts whoever made it (even
       -- someone I've blocked, like an owner removing a reported message).
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
  kind: "DIRECT" | "GROUP" | "CHANNEL";
  /** CHANNEL: staff only (no workers). */
  staffOnly: boolean;
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

/**
 * Each of my threads' latest visible message, in three queries: the newest
 * 20 per thread (inside my removal window), their revisions, my blocks.
 */
async function latestVisible(profileId: string): Promise<Map<string, ViewMessage>> {
  const rows = await db().$queryRaw<
    { id: string; conversationId: string; senderId: string; body: string; createdAt: Date; attachmentPath: string | null; attachmentName: string | null; attachmentType: string | null; attachmentSize: number | null; readUntil: Date | null; readFrom: Date | null }[]
  >`
    SELECT m."id"::text, m."conversationId"::text, m."senderId"::text, m."body", m."createdAt",
           m."attachmentPath", m."attachmentName", m."attachmentType", m."attachmentSize", p."removedAt" AS "readUntil",
           CASE WHEN p."role" = 'MANAGER' AND c."kind" = 'DIRECT' THEN p."addedAt" END AS "readFrom"
      FROM "ConversationParticipant" p
      JOIN "Conversation" c ON c."id" = p."conversationId"
      CROSS JOIN LATERAL (
        SELECT * FROM "Message" mm
         WHERE mm."conversationId" = p."conversationId" AND (p."removedAt" IS NULL OR mm."createdAt" <= p."removedAt")
           AND (p."role" = 'WORKER' OR mm."createdAt" >= p."addedAt"
            OR NOT EXISTS (SELECT 1 FROM "Conversation" cv WHERE cv."id" = p."conversationId" AND cv."kind" = 'DIRECT'))
           -- Skip messages from people I'd blocked at the time, so a run of
           -- them can't hide the latest message I can actually see.
           AND NOT EXISTS (SELECT 1 FROM "ProfileBlock" b
                            WHERE b."blockerId" = p."profileId" AND b."blockedId" = mm."senderId"
                              AND b."createdAt" <= mm."createdAt" AND (b."liftedAt" IS NULL OR mm."createdAt" < b."liftedAt"))
         ORDER BY mm."createdAt" DESC LIMIT 20) m
     WHERE p."profileId" = ${profileId}::uuid`;
  if (rows.length === 0) return new Map();
  const [revisions, blocks] = await Promise.all([
    db().messageRevision.findMany({ where: { messageId: { in: rows.map((r) => r.id) } } }),
    db().profileBlock.findMany({ where: { blockerId: profileId } }),
  ]);
  const byConv = new Map<string, typeof rows>();
  for (const r of rows) byConv.set(r.conversationId, [...(byConv.get(r.conversationId) ?? []), r]);
  const out = new Map<string, ViewMessage>();
  for (const [convId, msgs] of byConv) {
    const ids = new Set(msgs.map((m) => m.id));
    const view = viewMessages(
      msgs.map((m) => ({ id: m.id, senderId: m.senderId, body: m.body, createdAt: m.createdAt, attachment: m.attachmentPath ? { name: m.attachmentName ?? "file", type: m.attachmentType ?? "", size: m.attachmentSize ?? 0 } : null })),
      revisions.filter((r) => ids.has(r.messageId)).map((r) => ({ messageId: r.messageId, actorId: r.actorId, kind: r.kind, body: r.body, createdAt: r.createdAt })),
      profileId,
      blocks,
      msgs[0].readUntil,
      msgs[0].readFrom
    );
    const last = view.at(-1);
    if (last) out.set(convId, last);
  }
  return out;
}

export async function listThreads(me: ChatUser): Promise<{ threads: ThreadSummary[]; startable: StartableDirect[] }> {
  await ensureGeneral(me);
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
  const latest = await latestVisible(me.userId);
  // A staff row in a channel of an organization I'm no longer on the staff of lists nothing (lib/chat.ts).
  const mineStill = rows.filter((row) => !(row.role === "MEMBER" && (me.role === "WORKER" || row.conversation.orgId !== me.orgId)));
  const threads = mineStill.map((row): ThreadSummary => {
    const c = row.conversation;
    const last = latest.get(c.id);
    const direct = c.kind === "DIRECT";
    const other = direct ? (c.participants.find((p) => !p.removedAt) ?? c.participants[0]) : undefined;
    return {
      id: c.id,
      kind: c.kind,
      staffOnly: c.staffOnly,
      title: direct ? personName(other?.profile) : (c.name ?? "Team chat"),
      subtitle: direct ? (c.engagement?.job.title ?? "") : c.kind === "CHANNEL" ? (c.topic ?? "") : c.jobs.map((j) => j.job.title).join(" · "),
      frozen: row.removedAt !== null || c.archivedAt !== null || (direct && !isHired(c.engagement?.status ?? "")),
      unread: unread.get(c.id) ?? 0,
      last: last ? { text: preview(last), mine: last.senderId === me.userId, at: last.createdAt } : null,
      activeAt: last?.createdAt ?? c.createdAt,
    };
  });
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
  if (!me.orgId || !canUse(me, "messages")) return [];
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
  /** A reply: the message it answers. */
  parentId: string | null;
  /** Replies in this message's thread that I can see, and when the newest was sent. */
  replies: number;
  lastReplyAt: Date | null;
  /** Of those, how many from other people I had not read when this page was loaded. */
  newReplies: number;
  /** Each mark given to this message, with how many gave it and whether I did. */
  reactions: { emoji: Reaction; count: number; mine: boolean }[];
  canReact: boolean;
  canReply: boolean;
}
export interface ThreadMember {
  profileId: string;
  name: string;
  role: ParticipantRole;
  removed: boolean;
  isMe: boolean;
  /** I (a worker) have this manager blocked. */
  blockedByMe: boolean;
}
export interface ThreadView {
  id: string;
  kind: "DIRECT" | "GROUP" | "CHANNEL";
  title: string;
  subtitle: string;
  /** CHANNEL: what kind of channel this is, and what I may do with it. */
  channel: { staffOnly: boolean; isGeneral: boolean; archived: boolean; topic: string | null; canLeave: boolean; canArchive: boolean } | null;
  access: Access;
  /** GROUP: the team's jobs (for finding people to add). */
  jobIds: string[];
  /** DIRECT: this hire's next (or current) shift, for the card atop the thread. */
  nextShift: { id: string; startsAt: Date; endsAt: Date; stagingLocation: string | null; active: boolean } | null;
  /** DIRECT, frozen because the contact left while the hire is on: the worker can reopen with a current contact. */
  reopenEngagementId: string | null;
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
  const top = await loadView(db(), conv.id, me.userId, access, { take: THREAD_LIMIT, thread: null });
  const truncated = top.truncated;
  // A reply I can see under a message I can't (sent before I took over a direct thread, or by someone I had
  // blocked, or older than what is loaded) has no thread I could open: it reads here as an ordinary message,
  // so nothing I'm entitled to is left with nowhere to show.
  const loose = await loadView(db(), conv.id, me.userId, access, { repliesOnly: true, since: truncated ? top.view[0]?.createdAt : undefined });
  const looseParents = [...new Set(loose.view.map((r) => r.parentId).filter((id): id is string => !!id))];
  const shownParents = new Set(looseParents.length ? (await loadView(db(), conv.id, me.userId, access, { ids: looseParents, thread: null })).view.map((m) => m.id) : []);
  const view = [...top.view, ...loose.view.filter((r) => r.parentId && !shownParents.has(r.parentId))].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const extras = await messageExtras(db(), conv.id, me.userId, access, view, mine.lastReadAt);
  const myBlocks = new Set(
    (await db().profileBlock.findMany({ where: { blockerId: me.userId, liftedAt: null }, select: { blockedId: true } })).map((b) => b.blockedId)
  );
  const now = await dbNow(db());
  // Read up to the newest message actually loaded, never "now": a message
  // committing during this request stays unread. (Sends are serialized per
  // conversation, so nothing older than what we loaded can still appear.)
  // A reply counted under a message here was announced too (its thread link says how many are new), so the newest of those is read as well:
  // this page is the one place that can always clear the badge.
  const newest = [view.at(-1)?.createdAt, extras.newestReply].reduce<Date | undefined>((a, b) => (b && (!a || b > a) ? b : a), undefined);
  if (newest && (!mine.lastReadAt || newest > mine.lastReadAt)) {
    await db().conversationParticipant.update({ where: { id: mine.id }, data: { lastReadAt: newest } });
  }

  const byId = new Map(conv.participants.map((p) => [p.profileId, p]));
  const shift =
    conv.kind === "DIRECT" && conv.engagement && access.read && !mine.removedAt
      ? await db().shift.findFirst({
          where: { engagementId: conv.engagement.id, status: { in: ["SCHEDULED", "ACTIVE"] }, endsAt: { gte: now } },
          orderBy: { startsAt: "asc" },
          select: { id: true, startsAt: true, endsAt: true, stagingLocation: true, status: true },
        })
      : null;
  const direct = conv.kind === "DIRECT";
  const others = conv.participants.filter((p) => p.profileId !== me.userId);
  const other = direct ? (others.find((p) => !p.removedAt) ?? others.at(-1)) : undefined;
  return {
    id: conv.id,
    kind: conv.kind,
    title: direct ? personName(other?.profile) : (conv.name ?? "Team chat"),
    subtitle: direct ? (conv.engagement?.job.title ?? "") : conv.jobs.map((j) => j.job.title).join(" · "),
    channel:
      conv.kind === "CHANNEL"
        ? {
            staffOnly: conv.staffOnly,
            isGeneral: conv.isGeneral,
            archived: conv.archivedAt !== null,
            topic: conv.topic,
            canLeave: mine.role === "MEMBER" && canLeaveChannel(channelFacts(conv, mine)).ok,
            canArchive: !conv.isGeneral && conv.archivedAt === null && canManageChannels(me, conv.orgId).ok,
          }
        : null,
    access,
    jobIds: conv.jobs.map((j) => j.jobId),
    nextShift: shift ? { id: shift.id, startsAt: shift.startsAt, endsAt: shift.endsAt, stagingLocation: shift.stagingLocation, active: shift.status === "ACTIVE" } : null,
    reopenEngagementId:
      conv.kind === "DIRECT" && ctx.facts.counterpartRemoved && mine.role === "WORKER" && !mine.removedAt && isHired(conv.engagement?.status ?? "") ? (conv.engagement?.id ?? null) : null,
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
    messages: view.map((m) => threadMessage(m, me.userId, byId, access, now, extras)),
    hasOlder: truncated,
  };
}

// ---------------------------------------------------------------------------
// Threads (replies) and reactions
// ---------------------------------------------------------------------------

interface Extras {
  replies: Map<string, { count: number; last: Date; fresh: number }>;
  reactions: Map<string, { emoji: Reaction; count: number; mine: boolean }[]>;
  newestReply: Date | undefined;
}

/**
 * What hangs off the messages on screen: how many replies each has (as this
 * viewer sees them: their window and their blocks apply), and the reactions
 * each was given. A reaction from someone the viewer has blocked is not
 * counted.
 */
async function messageExtras(c: Client, conversationId: string, viewerId: string, window: { readUntil: Date | null; readFrom: Date | null }, view: ViewMessage[], lastReadAt: Date | null = null): Promise<Extras> {
  const ids = view.map((m) => m.id);
  const out: Extras = { replies: new Map(), reactions: new Map(), newestReply: undefined };
  if (ids.length === 0) return out;
  const { readUntil, readFrom } = window;
  const [replyRows, reactionRows, blocks] = await Promise.all([
    c.message.findMany({
      where: { conversationId, parentId: { in: ids }, ...(readUntil || readFrom ? { createdAt: { ...(readUntil ? { lte: readUntil } : {}), ...(readFrom ? { gte: readFrom } : {}) } } : {}) },
      select: { id: true, parentId: true, senderId: true, createdAt: true },
    }),
    // As of the viewer's window: a removed member sees the marks as they stood when they were removed (one taken back afterwards still shows for them).
    c.messageReaction.findMany({
      where: { messageId: { in: ids }, ...(readUntil ? { createdAt: { lte: readUntil }, OR: [{ removedAt: null }, { removedAt: { gt: readUntil } }] } : { removedAt: null }) },
      select: { messageId: true, profileId: true, emoji: true, createdAt: true },
    }),
    c.profileBlock.findMany({ where: { blockerId: viewerId } }),
  ]);
  const blockedAt = (who: string, at: Date) => blocks.some((b) => b.blockedId === who && b.createdAt <= at && (b.liftedAt === null || at < b.liftedAt));
  const blockedNow = new Set(blocks.filter((b) => b.liftedAt === null).map((b) => b.blockedId));
  for (const r of replyRows) {
    if (!r.parentId || blockedAt(r.senderId, r.createdAt)) continue;
    const cur = out.replies.get(r.parentId);
    const fresh = r.senderId !== viewerId && (!lastReadAt || r.createdAt > lastReadAt) ? 1 : 0;
    out.replies.set(r.parentId, { count: (cur?.count ?? 0) + 1, last: cur && cur.last > r.createdAt ? cur.last : r.createdAt, fresh: (cur?.fresh ?? 0) + fresh });
    if (!out.newestReply || r.createdAt > out.newestReply) out.newestReply = r.createdAt;
  }
  for (const id of ids) {
    // Hidden while the person is blocked, and a mark made during a block stays hidden afterwards, as their messages do.
    const rows = reactionRows.filter((r) => r.messageId === id && !blockedNow.has(r.profileId) && !blockedAt(r.profileId, r.createdAt));
    // In the fixed order of REACTIONS, so a row of marks never reshuffles as counts change.
    const marks = REACTIONS.map((emoji) => ({ emoji, count: rows.filter((r) => r.emoji === emoji).length, mine: rows.some((r) => r.emoji === emoji && r.profileId === viewerId) })).filter((x) => x.count > 0);
    if (marks.length) out.reactions.set(id, marks);
  }
  return out;
}

function threadMessage(m: ViewMessage, myId: string, byId: Map<string, { role: ParticipantRole; profile: Parameters<typeof personName>[0] }>, access: Access, now: Date, extras: Extras): ThreadMessage {
  const sender = byId.get(m.senderId);
  const mineMsg = m.senderId === myId;
  const thread = extras.replies.get(m.id);
  return {
    ...m,
    senderName: personName(sender?.profile),
    senderIsManager: !!sender && sender.role !== "WORKER",
    mine: mineMsg,
    canEdit: mineMsg && !m.deleted && !!m.body && access.post && now.getTime() - m.createdAt.getTime() <= EDIT_WINDOW_MS,
    canDelete: mineMsg && !m.deleted && access.post,
    replies: thread?.count ?? 0,
    lastReplyAt: thread?.last ?? null,
    newReplies: thread?.fresh ?? 0,
    reactions: extras.reactions.get(m.id) ?? [],
    canReact: canReact(access, m, REACTIONS[0]).ok,
    canReply: canReply(access, m).ok,
  };
}

export interface RepliesView {
  conversationId: string;
  kind: "DIRECT" | "GROUP" | "CHANNEL";
  /** The conversation's name, for the way back. */
  title: string;
  access: Access;
  /** I'm staff in this conversation (decides the composer's quick replies). */
  staff: boolean;
  parent: ThreadMessage;
  replies: ThreadMessage[];
  hasOlder: boolean;
}

/** One message and its replies, for someone in the conversation (and marks them read), or null. */
export async function openReplies(me: ChatUser, conversationId: string, parentId: string): Promise<RepliesView | null> {
  if (!UUID_RE.test(parentId)) return null;
  const ctx = await loadContext(db(), me, conversationId);
  if (!ctx || !ctx.access.read || !ctx.mine) return null;
  const { conv, mine, access } = ctx;
  const head = await loadView(db(), conv.id, me.userId, access, { ids: [parentId], thread: null });
  const parent = head.view[0];
  if (!parent) return null;
  const { view, truncated } = await loadView(db(), conv.id, me.userId, access, { take: THREAD_LIMIT, thread: parentId });
  const extras = await messageExtras(db(), conv.id, me.userId, access, [parent, ...view]);
  const now = await dbNow(db());
  // One read mark covers the whole conversation, so a thread moves it only when that skips nothing: no message
  // from someone else, outside this thread, between the mark and this thread's newest reply. Otherwise the badge
  // stays until the main conversation is opened, which is the safe way round.
  const newest = view.at(-1)?.createdAt;
  if (newest && (!mine.lastReadAt || newest > mine.lastReadAt)) {
    const skipped = await db().message.count({
      where: {
        conversationId: conv.id,
        senderId: { not: me.userId },
        createdAt: { ...(mine.lastReadAt ? { gt: mine.lastReadAt } : {}), lte: newest },
        // Everything except this thread: its own first message is on this page too.
        OR: [{ parentId: null, id: { not: parentId } }, { parentId: { not: parentId } }],
      },
    });
    if (skipped === 0) await db().conversationParticipant.update({ where: { id: mine.id }, data: { lastReadAt: newest } });
  }
  const byId = new Map(conv.participants.map((p) => [p.profileId, p]));
  const direct = conv.kind === "DIRECT";
  const other = direct ? conv.participants.find((p) => p.profileId !== me.userId && !p.removedAt) : undefined;
  return {
    conversationId: conv.id,
    kind: conv.kind,
    title: direct ? personName(other?.profile) : conv.kind === "CHANNEL" ? `#${conv.name ?? "channel"}` : (conv.name ?? "Team chat"),
    access,
    staff: mine.role !== "WORKER",
    parent: threadMessage(parent, me.userId, byId, access, now, extras),
    // Replies don't nest: a reply shows no thread of its own.
    replies: view.map((m) => ({ ...threadMessage(m, me.userId, byId, access, now, extras), canReply: false })),
    hasOlder: truncated,
  };
}

/** Give a message a mark, or take the same mark back. */
export async function toggleReaction(me: ChatUser, messageId: string, emoji: unknown): Promise<{ ok: true; on: boolean; conversationId: string; threadId: string | null } | Fail> {
  return db().$transaction(async (tx) => {
    const m = await lockedMessage(tx, me, messageId);
    if (!m || !m.ctx.access.read || !m.ctx.mine) return fail("That message isn't available.");
    const may = canReact(m.ctx.access, m.msg, emoji);
    if (!may.ok) return may;
    const mark = emoji as Reaction;
    // Where the message is shown, from the message itself (never from the caller).
    const where = { conversationId: m.ctx.conv.id, threadId: m.msg?.parentId ?? messageId };
    const live = await tx.messageReaction.findFirst({ where: { messageId, profileId: me.userId, emoji: mark, removedAt: null }, select: { id: true } });
    const now = await dbNow(tx);
    if (live) {
      await tx.messageReaction.update({ where: { id: live.id }, data: { removedAt: now } });
      return { ok: true as const, on: false, ...where };
    }
    // conversationId is set from the message by a trigger; the value here only satisfies the column.
    await tx.messageReaction.create({ data: { messageId, conversationId: m.ctx.conv.id, profileId: me.userId, emoji: mark, createdAt: now } });
    return { ok: true as const, on: true, ...where };
  });
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
    if (await runsTeams(c, created.actorId, orgId)) return created.actorId;
  }
  const owner = await c.profile.findFirst({ where: { orgId, role: "OWNER" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return owner?.id ?? null;
}

/** The direct thread for a hire, created on first use. Only the worker and the person who hired them. */
export type DirectFailCode = "not_found" | "not_hired" | "no_contact";
export async function ensureDirect(me: ChatUser, engagementId: string): Promise<{ ok: true; conversationId: string } | (Fail & { code: DirectFailCode })> {
  const r = await ensureDirectInner(me, engagementId);
  if (r.ok) return r;
  const code: DirectFailCode = r === NOT_HIRED ? "not_hired" : r === NO_CONTACT ? "no_contact" : "not_found";
  return { ...r, code };
}
const NOT_HIRED = fail("Messages unlock once the hire is confirmed.");
const NO_CONTACT = fail("No one at this organization can be messaged yet.");

async function ensureDirectInner(me: ChatUser, engagementId: string): Promise<{ ok: true; conversationId: string } | Fail> {
  if (!UUID_RE.test(engagementId)) return NOT_FOUND;
  return db().$transaction(async (tx) => {
    await lock(tx, `conv:engagement:${engagementId}`);
    const e = await tx.engagement.findUnique({
      where: { id: engagementId },
      include: { job: { select: { orgId: true } }, worker: { select: { profileId: true } }, conversation: { select: { id: true } } },
    });
    if (!e) return NOT_FOUND;
    const isWorker = e.worker.profileId === me.userId;
    const isBoss = e.hiredById === me.userId && me.orgId === e.job.orgId && canUse(me, "messages");
    if (!isWorker && !isBoss) return NOT_FOUND;
    if (!e.conversation && !isHired(e.status)) return NOT_HIRED;

    // The contact must still run this org's teams; otherwise fall back.
    const boss = e.hiredById ? await tx.profile.findUnique({ where: { id: e.hiredById }, select: { id: true, orgId: true } }) : null;
    const stillStaff = !!boss && boss.orgId === e.job.orgId && (await runsTeams(tx, boss.id, e.job.orgId));

    if (e.conversation) {
      await lock(tx, `conv:${e.conversation.id}`); // order: conv:engagement → conv
      // If the contact left (removed by the staff trigger) while the hire is
      // still on, hand the thread to a current contact instead of stranding it.
      const managers = await tx.conversationParticipant.findMany({ where: { conversationId: e.conversation.id, role: "MANAGER" } });
      if (isHired(e.status) && !managers.some((m) => !m.removedAt)) {
        const next = stillStaff ? boss.id : await defaultBoss(tx, e.jobId, e.job.orgId);
        if (next && next !== e.worker.profileId) {
          const prior = managers.find((m) => m.profileId === next);
          // The contact reads from strictly after the last message — a
          // returning one too: what the worker said to the contacts in
          // between was private to them.
          const last = (await tx.conversation.findUniqueOrThrow({ where: { id: e.conversation.id }, select: { lastMessageAt: true } })).lastMessageAt;
          let addedAt = await dbNow(tx);
          if (last && addedAt <= last) addedAt = new Date(last.getTime() + 1);
          if (prior) {
            await tx.conversationParticipant.update({ where: { id: prior.id }, data: { removedAt: null, removedById: null, addedById: me.userId, addedAt } });
          } else {
            await tx.conversationParticipant.create({ data: { conversationId: e.conversation.id, profileId: next, role: "MANAGER", addedById: me.userId, addedAt } });
          }
          if (next !== e.hiredById) await tx.engagement.update({ where: { id: e.id }, data: { hiredById: next } });
          await audit(tx, me.userId, "conversation.member_added", "Conversation", e.conversation.id, { profileId: next, role: "MANAGER", reason: "contact_left" });
        }
      }
      return { ok: true as const, conversationId: e.conversation.id };
    }

    const bossId = stillStaff ? boss.id : await defaultBoss(tx, e.jobId, e.job.orgId);
    if (!bossId || bossId === e.worker.profileId) return NO_CONTACT;
    if (bossId !== e.hiredById) await tx.engagement.update({ where: { id: e.id }, data: { hiredById: bossId } });
    const at = await dbNow(tx);
    const conv = await tx.conversation.create({
      data: {
        kind: "DIRECT",
        orgId: e.job.orgId,
        engagementId: e.id,
        createdById: me.userId,
        createdAt: at,
        participants: {
          create: [
            { profileId: e.worker.profileId, role: "WORKER", addedById: me.userId, addedAt: at },
            { profileId: bossId, role: "MANAGER", addedById: me.userId, addedAt: at },
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
  store: AttachmentStore = supabaseStore(),
  /** A reply: the message it answers, in this conversation. */
  rawParentId: string | null = null
): Promise<{ ok: true; messageId: string } | Fail> {
  const body = cleanBody(rawBody);
  const parentId = rawParentId || null;
  if (parentId && !UUID_RE.test(parentId)) return fail("That message isn't available.");
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
      if (parentId) {
        // The message being answered, as I see it: in this conversation, inside my window, not from someone I'd blocked.
        const head = await loadView(tx, conversationId, me.userId, ctx.access, { ids: [parentId] });
        const may = canReply(ctx.access, head.view[0] ?? null);
        if (!may.ok) return may;
      }
      // Strictly after the previous message, so "read up to X" is exact.
      let at = await dbNow(tx);
      if (ctx.conv.lastMessageAt && at <= ctx.conv.lastMessageAt) at = new Date(ctx.conv.lastMessageAt.getTime() + 1);
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId: me.userId,
          body,
          attachmentPath: attachment?.path,
          attachmentName: attachment?.name,
          attachmentType: attachment?.type,
          attachmentSize: attachment?.size,
          parentId,
          createdAt: at,
        },
      });
      if (!ctx.conv.lastMessageAt || ctx.conv.lastMessageAt < at) await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: at } });
      // Sending in the main conversation means I'm looking at it. A reply is sent from a thread's page, which shows only that thread: it marks nothing read.
      if (!parentId) await tx.conversationParticipant.update({ where: { id: ctx.mine.id }, data: { lastReadAt: at } });
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
  const window = ctx.access.read ? ctx.access : { readUntil: null, readFrom: null };
  const { view, rows, revisions } = await loadView(tx, head.conversationId, me.userId, window, { ids: [messageId] });
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
    const moderator = canUse(me, "moderation") && !!m && me.orgId === m.ctx.conv.orgId;
    if (!m || !m.msg || (!m.ctx.access.read && !moderator)) return fail("Message not found.");
    const reported = (await tx.messageReport.count({ where: { messageId, resolvedAt: null } })) > 0;
    const ok = canDelete(m.ctx.access, m.msg, { profileId: me.userId, role: me.role, grants: me.grants, orgId: me.orgId }, m.ctx.conv.orgId, reported);
    if (!ok.ok) return ok;
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
    // The text as the reporter saw it — kept even if it's later edited or
    // deleted. (An edit by someone they blocked is hidden from them too.)
    const text = m.msg.body ?? "";
    const snapshot = m.msg.attachment ? `${text}${text ? "\n" : ""}[Attachment: ${m.msg.attachment.name}]` : text;
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
  conversationId: string;
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
  if (!canUse(me, "moderation") || !me.orgId) return [];
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
      conversationId: r.conversationId,
      conversationTitle: conv.kind === "CHANNEL" ? `#${conv.name ?? "channel"}` : conv.kind === "GROUP" ? (conv.name ?? "Team chat") : `Direct messages · ${conv.engagement?.job.title ?? ""}`,
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
  if (!canUse(me, "moderation") || !me.orgId || !UUID_RE.test(reportId)) return fail("Report not found.");
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
    (await db().conversationParticipant.findFirst({ where: { ...shared, role: { in: ["MANAGER", "MEMBER"] } }, select: { role: true } })) ??
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
  role: ParticipantRole;
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

/**
 * Who can be added to a team on these jobs: org staff, and workers hired on
 * them. For a channel: every staff member of the organization (as MEMBER),
 * and, unless it is staff-only, workers hired on its jobs.
 */
export async function teamCandidates(me: ChatUser, jobIds: string[], c: Client = db(), channel: { staffOnly: boolean } | null = null): Promise<Candidate[]> {
  if (!canCreateGroup(me).ok || !me.orgId || !jobIds.every((id) => UUID_RE.test(id))) return [];
  const staffRole: ParticipantRole = channel ? "MEMBER" : "MANAGER";
  const [staff, hires] = await Promise.all([
    c.profile.findMany({ where: channel ? { orgId: me.orgId, role: { not: "WORKER" }, closedAt: null } : { orgId: me.orgId, ...areaMembers("messages") }, select: PERSON.select, orderBy: { createdAt: "asc" } }),
    channel?.staffOnly || jobIds.length === 0 ? [] : c.engagement.findMany({
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
    ...staff.map((p): Candidate => ({ profileId: p.id, name: personName(p), role: staffRole, detail: p.role === "CUSTOM" ? (p.orgRole?.name ?? "Team member") : (ROLE_LABEL[p.role] ?? p.role) })),
    ...[...workers.values()].sort((a, b) => a.name.localeCompare(b.name)),
  ];
}

const uniqueIds = (raw: unknown, max: number): string[] | null => {
  if (!Array.isArray(raw) || raw.length > max || !raw.every((x) => typeof x === "string" && UUID_RE.test(x))) return null;
  return [...new Set(raw as string[])];
};

async function resolveMembers(c: Client, me: ChatUser, jobIds: string[], profileIds: string[], channel: { staffOnly: boolean } | null = null): Promise<Map<string, ParticipantRole> | Fail> {
  const eligible = new Map((await teamCandidates(me, jobIds, c, channel)).map((x) => [x.profileId, x.role]));
  const out = new Map<string, ParticipantRole>();
  for (const id of profileIds) {
    const role = eligible.get(id);
    if (!role) return fail(channel?.staffOnly ? "Add this organization's staff. This channel is staff only." : channel ? "Add this organization's staff, or workers hired on the channel's jobs." : "Add this organization's staff, or workers hired on the team's jobs.");
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
    members.set(me.userId, "MANAGER" as ParticipantRole);
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
    if (ctx.conv.archivedAt) return fail("This channel is archived.");
    const members = await resolveMembers(tx, me, ctx.conv.jobs.map((j) => j.jobId), ids, ctx.conv.kind === "CHANNEL" ? { staffOnly: ctx.conv.staffOnly } : null);
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
    if (!target) return fail(ctx.conv.kind === "CHANNEL" ? "That person isn't in this channel." : "That person isn't in this team chat.");
    if (ctx.conv.isGeneral) return fail("Everyone on staff stays in the general channel.");
    await tx.conversationParticipant.update({ where: { id: target.id }, data: { removedAt: await dbNow(tx), removedById: me.userId } });
    await audit(tx, me.userId, "conversation.member_removed", "Conversation", conversationId, { profileId });
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// Channels (lib/chat.ts "Channels"; prisma/p2-channels.sql)
// ---------------------------------------------------------------------------

const channelFacts = (conv: { orgId: string; archivedAt: Date | null; isGeneral: boolean }, mine: { role: ParticipantRole; removedAt: Date | null } | null): ChannelFacts => ({
  orgId: conv.orgId,
  archived: conv.archivedAt !== null,
  isGeneral: conv.isGeneral,
  participant: mine ? { role: mine.role, removedAt: mine.removedAt } : null,
});

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * Every staff member is in their organization's general channel. It is made
 * the first time anyone on staff opens Messages, with everyone then on staff
 * in it; a later joiner is added the next time they, or anyone not yet in
 * it, opens Messages. Someone who left the organization and came back is put
 * in again. Workers have no general channel.
 */
export async function ensureGeneral(me: ChatUser): Promise<void> {
  if (me.role === "WORKER" || !me.orgId) return;
  const orgId = me.orgId;
  const existing = await db().conversation.findFirst({ where: { orgId, isGeneral: true }, select: { id: true, participants: { where: { profileId: me.userId, removedAt: null }, select: { id: true } } } });
  if (existing?.participants.length) return;
  try {
    await ensureGeneralLocked(me, orgId);
  } catch (e) {
    // A live channel that already holds the name and can't be adopted (it has workers in it): Messages still opens, without a general channel, until that one is renamed or archived.
    if (!isUniqueViolation(e)) throw e;
    console.error("[turfcut] the general channel could not be made: a channel named general already exists", orgId);
  }
}

async function ensureGeneralLocked(me: ChatUser, orgId: string): Promise<void> {
  await db().$transaction(async (tx) => {
    await lock(tx, `general:${orgId}`);
    // Still on this organization's staff, read inside the lock.
    if ((await tx.profile.count({ where: { id: me.userId, orgId, role: { not: "WORKER" }, closedAt: null } })) === 0) return;
    let general = await tx.conversation.findFirst({ where: { orgId, isGeneral: true }, select: { id: true } });
    const now = await dbNow(tx);
    if (!general) {
      // The name is kept for this channel (createChannel refuses it). A staff-only channel made by hand
      // under that name before this rule existed becomes the general channel, rather than blocking it.
      const named = await tx.conversation.findFirst({ where: { orgId, kind: "CHANNEL", archivedAt: null, staffOnly: true, name: { equals: GENERAL_CHANNEL, mode: "insensitive" } }, select: { id: true } });
      if (named) {
        general = await tx.conversation.update({ where: { id: named.id }, data: { isGeneral: true }, select: { id: true } });
        await audit(tx, me.userId, "channel.made_general", "Conversation", general.id, { name: GENERAL_CHANNEL });
      }
    }
    if (!general) {
      general = await tx.conversation.create({
        data: { kind: "CHANNEL", orgId, name: GENERAL_CHANNEL, topic: "Everyone on staff. Announcements and day-to-day talk.", staffOnly: true, isGeneral: true, createdById: me.userId },
        select: { id: true },
      });
      await audit(tx, me.userId, "channel.created", "Conversation", general.id, { name: GENERAL_CHANNEL, general: true });
    }
    // Everyone on staff who has no row yet, not only me: a colleague who hasn't opened Messages is in the channel too.
    // They start with it read, so a first visit doesn't count the whole history as unread. The time is
    // taken in SQL, as dbNow() takes it: a bound JS date would be shifted by the session's time zone.
    await tx.$executeRaw`
      INSERT INTO "ConversationParticipant" ("id", "conversationId", "profileId", "role", "addedById", "addedAt", "lastReadAt")
      SELECT gen_random_uuid(), ${general.id}::uuid, p."id", 'MEMBER'::"ParticipantRole", ${me.userId}::uuid, t."now", t."now"
        FROM "Profile" p, (SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS "now") t
       WHERE p."orgId" = ${orgId}::uuid AND p."role"::text <> 'WORKER' AND p."closedAt" IS NULL
      ON CONFLICT ("conversationId", "profileId") DO NOTHING`;
    // I had a row that ended (I left the organization and came back): I'm in it again, from now.
    await tx.conversationParticipant.updateMany({ where: { conversationId: general.id, profileId: me.userId, removedAt: { not: null } }, data: { role: "MEMBER", removedAt: null, removedById: null, addedAt: now, addedById: me.userId, lastReadAt: now } });
  });
}

export interface ChannelSummary {
  id: string;
  name: string;
  topic: string | null;
  staffOnly: boolean;
  isGeneral: boolean;
  members: number;
  /** I'm in it now. */
  joined: boolean;
}

/** The organization's live channels, for staff to open or join. Workers get none: they see only channels they were added to, in their thread list. */
export async function browseChannels(me: ChatUser): Promise<ChannelSummary[]> {
  if (me.role === "WORKER" || !me.orgId) return [];
  const rows = await db().conversation.findMany({
    where: { orgId: me.orgId, kind: "CHANNEL", archivedAt: null },
    select: { id: true, name: true, topic: true, staffOnly: true, isGeneral: true, participants: { where: { removedAt: null }, select: { profileId: true } } },
    orderBy: [{ isGeneral: "desc" }, { name: "asc" }],
  });
  return rows.map((c) => ({ id: c.id, name: c.name ?? "channel", topic: c.topic, staffOnly: c.staffOnly, isGeneral: c.isGeneral, members: c.participants.length, joined: c.participants.some((p) => p.profileId === me.userId) }));
}

export async function createChannel(me: ChatUser, input: { name: unknown; topic: unknown; staffOnly: unknown; jobIds: unknown }): Promise<{ ok: true; conversationId: string } | Fail> {
  const may = canManageChannels(me);
  if (!may.ok || !me.orgId) return may.ok ? fail("No organization on this account.") : may;
  const name = validateChannelName(input.name);
  if (!name.ok) return name;
  const topic = validateChannelTopic(input.topic);
  if (!topic.ok) return topic;
  // The general channel's name is its own: it is made for everyone on staff, never by hand.
  if (name.name === GENERAL_CHANNEL) return fail(`#${GENERAL_CHANNEL} already exists, for everyone on staff. Pick another name.`);
  await ensureGeneral(me);
  const staffOnly = input.staffOnly === true;
  const jobIds = staffOnly ? [] : uniqueIds(input.jobIds, 20);
  if (!jobIds || (!staffOnly && jobIds.length === 0)) return fail("Pick at least one job, so its hired workers can be added. Or make the channel staff only.");
  const orgId = me.orgId;
  try {
    return await db().$transaction(async (tx) => {
      if ((await tx.job.count({ where: { id: { in: jobIds }, orgId } })) !== jobIds.length) return fail("Pick jobs from your organization.");
      const conv = await tx.conversation.create({
        data: {
          kind: "CHANNEL",
          orgId,
          name: name.name,
          topic: topic.topic,
          staffOnly,
          createdById: me.userId,
          jobs: { create: jobIds.map((jobId) => ({ jobId })) },
          participants: { create: [{ profileId: me.userId, role: "MEMBER", addedById: me.userId }] },
        },
      });
      await audit(tx, me.userId, "channel.created", "Conversation", conv.id, { name: name.name, staffOnly, jobIds });
      return { ok: true as const, conversationId: conv.id };
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail(`There is already a channel named #${name.name}.`);
    throw e;
  }
}

/** Staff put themselves in a channel of their organization. Rejoining gives the full history, like any new member. */
export async function joinChannel(me: ChatUser, conversationId: string): Promise<{ ok: true } | Fail> {
  if (!UUID_RE.test(conversationId)) return NOT_FOUND;
  return db().$transaction(async (tx) => {
    await lock(tx, `conv:${conversationId}`);
    const conv = await tx.conversation.findUnique({ where: { id: conversationId }, include: { participants: { where: { profileId: me.userId } } } });
    if (!conv || conv.kind !== "CHANNEL" || !isChannelStaff(me, conv.orgId)) return NOT_FOUND;
    // Still on this organization's staff, read inside the lock.
    if ((await tx.profile.count({ where: { id: me.userId, orgId: conv.orgId, role: { not: "WORKER" }, closedAt: null } })) === 0) return NOT_FOUND;
    const mine = conv.participants[0] ?? null;
    const may = canJoinChannel(me, channelFacts(conv, mine));
    if (!may.ok) return mine && !mine.removedAt ? { ok: true as const } : may;
    const now = await dbNow(tx);
    // Joining starts read: the history is there to scroll, not a count of unread messages.
    if (mine) await tx.conversationParticipant.update({ where: { id: mine.id }, data: { role: "MEMBER", removedAt: null, removedById: null, addedAt: now, addedById: me.userId, lastReadAt: now } });
    else await tx.conversationParticipant.create({ data: { conversationId, profileId: me.userId, role: "MEMBER", addedById: me.userId, addedAt: now, lastReadAt: now } });
    await audit(tx, me.userId, "channel.joined", "Conversation", conversationId, {});
    return { ok: true as const };
  });
}

/** Leaving keeps read-only history up to now. Nobody leaves the general channel. */
export async function leaveChannel(me: ChatUser, conversationId: string): Promise<{ ok: true } | Fail> {
  if (!UUID_RE.test(conversationId)) return NOT_FOUND;
  return db().$transaction(async (tx) => {
    await lock(tx, `conv:${conversationId}`);
    const conv = await tx.conversation.findUnique({ where: { id: conversationId }, include: { participants: { where: { profileId: me.userId } } } });
    const mine = conv?.participants[0] ?? null;
    if (!conv || conv.kind !== "CHANNEL" || !mine) return NOT_FOUND;
    // A worker is taken out by a manager or by their hire ending, the same as in a team chat.
    if (mine.role !== "MEMBER") return fail("Ask a manager to take you out of this channel.");
    const may = canLeaveChannel(channelFacts(conv, mine));
    if (!may.ok) return may;
    await tx.conversationParticipant.update({ where: { id: mine.id }, data: { removedAt: await dbNow(tx), removedById: me.userId } });
    await audit(tx, me.userId, "channel.left", "Conversation", conversationId, {});
    return { ok: true as const };
  });
}

/** Archiving makes a channel read-only for everyone and takes it out of the list to join. The general channel is never archived. */
export async function archiveChannel(me: ChatUser, conversationId: string): Promise<{ ok: true } | Fail> {
  if (!UUID_RE.test(conversationId)) return NOT_FOUND;
  return db().$transaction(async (tx) => {
    await lock(tx, `conv:${conversationId}`);
    const conv = await tx.conversation.findUnique({ where: { id: conversationId }, select: { kind: true, orgId: true, isGeneral: true, archivedAt: true, name: true } });
    if (!conv || conv.kind !== "CHANNEL" || !isChannelStaff(me, conv.orgId)) return NOT_FOUND;
    const may = canManageChannels(me, conv.orgId);
    if (!may.ok) return may;
    if (conv.isGeneral) return fail("The general channel can't be archived.");
    if (conv.archivedAt) return { ok: true as const };
    await tx.conversation.update({ where: { id: conversationId }, data: { archivedAt: await dbNow(tx), archivedById: me.userId } });
    await audit(tx, me.userId, "channel.archived", "Conversation", conversationId, { name: conv.name });
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
  const { view } = await loadView(db(), head.conversationId, me.userId, ctx.access, { ids: [messageId] });
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
