/**
 * In-app messaging rules (M4). Pure functions — no database access. Every
 * server read and write calls these; Supabase Realtime is guarded by the
 * matching RLS policies in prisma/m4-migration.sql.
 *
 * - Direct messages: one thread per hired (worker, job), with the person who
 *   hired them. Unlocked by the hire, frozen (read-only) when it ends.
 * - Team chats: created by organizers; workers are added (never themselves)
 *   and may post only while hired on one of the chat's jobs.
 * - Removed members keep read-only history up to their removal. Members
 *   (including anyone re-added) see the team's full history. Leaving the
 *   org or the job removes people automatically (database triggers).
 * - A worker can block an employer/manager: that person can no longer post
 *   to them directly, and group messages they send while blocked are hidden
 *   from the worker (and stay hidden after unblocking).
 * - Messages are immutable; edits (within 5 minutes) and deletes are
 *   appended revisions. A deleted message shows as a tombstone.
 * - Channels (Nov 2026): named, browsable channels in the organization's
 *   workspace. Every staff member is in "general"; staff join and leave the
 *   others themselves, whatever their role. A channel that is not staff-only
 *   is tied to jobs, and its managers can add workers hired on them (workers
 *   never join by themselves and never see a staff-only channel). Those who
 *   run team chats (the Messages area) create, archive and manage channels.
 *   An archived channel is read-only.
 * - Nothing here reads, infers or labels political fit or chat content.
 */
import type { Role } from "@/lib/auth";
import { canUse, type Grants } from "@/lib/access";

const HIRED = new Set(["ACTIVE", "CLAIMED"]);

export const MAX_BODY = 4000;
export const EDIT_WINDOW_MS = 5 * 60_000;
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const PETITION_NOTICE = "Do not photograph or share signed petition sheets. Custody is tracked as packet IDs and counts only.";

export type Kind = "DIRECT" | "GROUP" | "CHANNEL";
/** WORKER: a hired worker. MANAGER: staff running a direct thread or team chat. MEMBER: staff in a channel. */
export type ParticipantRole = "WORKER" | "MANAGER" | "MEMBER";

export interface ChatFacts {
  kind: Kind;
  orgId: string;
  me: { profileId: string; role: Role; grants?: Grants | null; orgId: string | null };
  /** My participant row, if any. */
  participant: { role: ParticipantRole; removedAt: Date | null; addedAt?: Date } | null;
  /** CHANNEL: archived (read-only for everyone). */
  archived?: boolean;
  /** DIRECT: the engagement's status. */
  engagementStatus?: string;
  /** GROUP or CHANNEL, worker: hired (ACTIVE/CLAIMED) on at least one of the chat's jobs. */
  hiredOnLinkedJob?: boolean;
  /** DIRECT: the other person has an active block against me. */
  blockedByOther?: boolean;
  /** DIRECT: the other person was removed (e.g. left the organization). */
  counterpartRemoved?: boolean;
}

export interface Access {
  read: boolean;
  /** Messages after this are hidden (removed members). null = no limit. */
  readUntil: Date | null;
  /**
   * Messages before this are hidden. Direct threads only: a contact who
   * takes over a worker's thread sees it from when they joined, never the
   * worker's earlier private messages. null = from the start.
   */
  readFrom: Date | null;
  post: boolean;
  /** Why posting is closed, in plain words (null when open). */
  closed: string | null;
}

const NONE: Access = { read: false, readUntil: null, readFrom: null, post: false, closed: "You're not in this conversation." };

export function chatAccess(f: ChatFacts): Access {
  const p = f.participant;
  if (!p) return NONE;
  const readFrom = f.kind === "DIRECT" && p.role === "MANAGER" ? (p.addedAt ?? null) : null;
  if (p.removedAt) {
    // History is kept for someone who left a channel while still on its organization's staff. A login that
    // has since left the organization, or become a worker, reads none of it: workers never see staff channels.
    if (p.role === "MEMBER" && (f.kind !== "CHANNEL" || f.me.role === "WORKER" || f.me.orgId !== f.orgId)) return { ...NONE, closed: "You're no longer in this organization." };
    // Staff leave a channel themselves and may join again; everyone else was taken out.
    const closed = f.kind === "CHANNEL" && p.role === "MEMBER" ? "You're no longer in this channel. History up to then is read-only; join again from Channels." : "You were removed from this conversation. History is read-only.";
    return { read: true, readUntil: p.removedAt, readFrom, post: false, closed };
  }
  const open = (): Access => ({ read: true, readUntil: null, readFrom, post: true, closed: null });
  const frozen = (closed: string): Access => ({ read: true, readUntil: null, readFrom, post: false, closed });

  if (p.role === "MANAGER") {
    // Someone who no longer runs this organization's teams (left, or their role lost Messages) reads nothing more: the participant row is ended when that happens, and this holds if a path missed it.
    if (f.me.orgId !== f.orgId || !canUse(f.me, "messages")) return { read: false, readUntil: null, readFrom, post: false, closed: "You no longer manage this conversation." };
  }
  if (p.role === "MEMBER") {
    // A channel member is staff of the channel's organization, whatever their role. (Leaving the organization ends the participant row; this holds if a path missed it.)
    if (f.kind !== "CHANNEL" || f.me.role === "WORKER" || f.me.orgId !== f.orgId) return { read: false, readUntil: null, readFrom, post: false, closed: "You're no longer in this organization." };
  }
  if (f.kind === "CHANNEL" && f.archived) return frozen("This channel is archived. History is read-only.");
  if (f.kind === "DIRECT") {
    if (!HIRED.has(f.engagementStatus ?? "")) return frozen("This job has ended. The conversation is read-only.");
    if (f.counterpartRemoved) return frozen("The other person has left this conversation. History is read-only.");
    if (f.blockedByOther) return frozen("You can't send messages in this conversation.");
    return open();
  }
  if (p.role === "WORKER" && !f.hiredOnLinkedJob) return frozen(f.kind === "CHANNEL" ? "You're no longer on a job for this channel. History is read-only." : "You're no longer on a job for this team. History is read-only.");
  return open();
}

// ---------------------------------------------------------------------------
// What a viewer sees: revisions applied, blocks and removal honoured
// ---------------------------------------------------------------------------

export interface RawMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: Date;
  attachment: { name: string; type: string; size: number } | null;
  /** A reply: the message it answers. */
  parentId?: string | null;
}
export interface RawRevision {
  messageId: string;
  actorId: string;
  kind: "EDIT" | "DELETE";
  body: string | null;
  createdAt: Date;
}
export interface Block {
  blockerId: string;
  blockedId: string;
  createdAt: Date;
  liftedAt: Date | null;
}
export interface ViewMessage {
  id: string;
  senderId: string;
  createdAt: Date;
  /** null when deleted (tombstone). */
  body: string | null;
  edited: boolean;
  deleted: boolean;
  attachment: RawMessage["attachment"];
  /** A reply: the message it answers (null for a message in the main conversation). */
  parentId: string | null;
}

export function viewMessages(
  messages: RawMessage[],
  revisions: RawRevision[],
  viewerId: string,
  blocks: Block[],
  readUntil: Date | null,
  readFrom: Date | null = null
): ViewMessage[] {
  const byMsg = new Map<string, RawRevision[]>();
  for (const r of revisions) byMsg.set(r.messageId, [...(byMsg.get(r.messageId) ?? []), r]);
  // Hidden if sent while the viewer had that sender blocked — and it stays
  // hidden after unblocking (same rule as the Realtime RLS policy).
  const myBlocks = blocks.filter((b) => b.blockerId === viewerId);
  const blockedAt = (sender: string, at: Date) =>
    myBlocks.some((b) => b.blockedId === sender && b.createdAt <= at && (b.liftedAt === null || at < b.liftedAt));
  return messages
    .filter((m) => (!readUntil || m.createdAt <= readUntil) && (!readFrom || m.createdAt >= readFrom))
    .filter((m) => !blockedAt(m.senderId, m.createdAt))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((m) => {
      // Edits by someone the viewer blocked stay hidden; a deletion has no
      // content, so it applies whoever made it (an owner removing a
      // reported message must remove it for everyone).
      const revs = (byMsg.get(m.id) ?? [])
        .filter((r) => (!readUntil || r.createdAt <= readUntil) && (r.kind === "DELETE" || !blockedAt(r.actorId, r.createdAt)))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const deleted = revs.some((r) => r.kind === "DELETE");
      const lastEdit = [...revs].reverse().find((r) => r.kind === "EDIT");
      return {
        id: m.id,
        senderId: m.senderId,
        createdAt: m.createdAt,
        body: deleted ? null : (lastEdit?.body ?? m.body),
        edited: !deleted && !!lastEdit,
        deleted,
        attachment: deleted ? null : m.attachment,
        parentId: m.parentId ?? null,
      };
    });
}

/** Unread = visible messages from others after my last read. */
export function unreadCount(view: ViewMessage[], viewerId: string, lastReadAt: Date | null): number {
  return view.filter((m) => m.senderId !== viewerId && !m.deleted && (!lastReadAt || m.createdAt > lastReadAt)).length;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type Check = { ok: true } | { ok: false; reason: string };
const no = (reason: string): Check => ({ ok: false, reason });
const yes: Check = { ok: true };
const NONE_CHECK = no("You're not in this conversation.");

export function cleanBody(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
}

export function canSend(access: Access, body: string, hasAttachment: boolean): Check {
  if (!access.post) return no(access.closed ?? "You can't send messages here.");
  if (!body && !hasAttachment) return no("Write a message.");
  if (body.length > MAX_BODY) return no(`Keep messages under ${MAX_BODY.toLocaleString("en-US")} characters.`);
  return yes;
}

export function canEdit(access: Access, msg: ViewMessage, me: string, body: string, now: Date): Check {
  if (msg.senderId !== me) return no("You can only edit your own messages.");
  if (msg.deleted) return no("That message was deleted.");
  if (now.getTime() - msg.createdAt.getTime() > EDIT_WINDOW_MS) return no("Messages can be edited for 5 minutes after sending.");
  if (!access.post) return no(access.closed ?? "You can't edit messages here.");
  if (!body) return no("A message can't be empty — delete it instead.");
  if (body.length > MAX_BODY) return no(`Keep messages under ${MAX_BODY.toLocaleString("en-US")} characters.`);
  if (body === msg.body) return no("Nothing changed.");
  return yes;
}

/**
 * Soft delete: the sender (while they can still post), or the org owner
 * moderating a message with an open report. The original stays in the store and in
 * any report's snapshot.
 */
export function canDelete(access: Access, msg: ViewMessage, me: { profileId: string; role: Role; grants?: Grants | null; orgId: string | null }, orgId: string, reported: boolean): Check {
  if (msg.deleted) return no("That message is already deleted.");
  // Read-only members (removed, hire ended, blocked) can't change history.
  if (msg.senderId === me.profileId && access.post) return yes;
  if (canUse(me, "moderation") && me.orgId === orgId && reported) return yes;
  if (msg.senderId === me.profileId) return no(access.closed ?? "This conversation is read-only.");
  return no("You can only delete your own messages.");
}

export function canReport(access: Access, msg: ViewMessage, me: string, reason: string): Check {
  if (!access.read) return NONE_CHECK;
  if (msg.senderId === me) return no("You can't report your own message.");
  if (!reason.trim()) return no("Say briefly what's wrong.");
  if (reason.length > 500) return no("Keep the reason under 500 characters.");
  return yes;
}

/** A worker may block a manager they share a conversation with — never a fellow worker. */
export function canBlock(me: { role: Role }, target: { role: ParticipantRole } | null): Check {
  if (me.role !== "WORKER") return no("Only workers can block.");
  if (!target) return no("You don't share a conversation with that person.");
  if (target.role === "WORKER") return no("You can block employers and managers.");
  return yes;
}

/** Group members are managed by the chat's active managers and the org owner. */
export function canManageMembers(f: ChatFacts): Check {
  if (f.kind === "DIRECT") return no("Direct conversations have fixed members.");
  if (canUse(f.me, "moderation") && f.me.orgId === f.orgId) return yes;
  // A channel is managed by whoever runs teams in its organization, in the channel or not.
  if (f.kind === "CHANNEL") return f.me.orgId === f.orgId && canUse(f.me, "messages") ? yes : no("Owners, recruiters and supervisors manage channels.");
  const a = chatAccess(f);
  if (f.participant?.role === "MANAGER" && a.post) return yes;
  return no("Only this team's managers can add or remove members.");
}

export function canCreateGroup(me: { role: Role; grants?: Grants | null; orgId: string | null }): Check {
  if (!me.orgId || !canUse(me, "messages")) return no("Owners, recruiters and supervisors create team chats.");
  return yes;
}

export function validateGroupName(raw: unknown): { ok: true; name: string } | { ok: false; reason: string } {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) return { ok: false, reason: "Name the team chat." };
  if (name.length > 80) return { ok: false, reason: "Keep the name under 80 characters." };
  return { ok: true, name };
}

// ---------------------------------------------------------------------------
// Threads and reactions
// ---------------------------------------------------------------------------

/** The marks a message can be given. The same set is checked by the database (prisma/p2-threads.sql). */
export const REACTIONS = ["\u{1F44D}", "\u2764\uFE0F", "\u{1F602}", "\u{1F389}", "\u{1F440}", "\u2705"] as const;
export type Reaction = (typeof REACTIONS)[number];
/** What a screen reader says for each mark. */
export const REACTION_NAMES: Record<Reaction, string> = { "\u{1F44D}": "thumbs up", "\u2764\uFE0F": "heart", "\u{1F602}": "laughing", "\u{1F389}": "celebration", "\u{1F440}": "looking", "\u2705": "done" };
export const isReaction = (v: unknown): v is Reaction => typeof v === "string" && (REACTIONS as readonly string[]).includes(v);

/**
 * Replying in a thread: anyone who may post, under a message they can see
 * that is not itself a reply (threads are one level deep). A deleted
 * message can still be answered: its thread outlives it.
 */
export function canReply(access: Access, parent: ViewMessage | null): Check {
  if (!access.post) return no(access.closed ?? "You can't post here.");
  if (!parent) return no("That message isn't available.");
  if (parent.parentId) return no("Reply in the thread, not to a reply.");
  return yes;
}

/** Reacting: anyone who may post, on a message they can see that isn't deleted, with one of the fixed marks. */
export function canReact(access: Access, msg: ViewMessage | null, emoji: unknown): Check {
  if (!access.post) return no(access.closed ?? "You can't react here.");
  if (!msg) return no("That message isn't available.");
  if (msg.deleted) return no("That message was deleted.");
  if (!isReaction(emoji)) return no("Pick one of the reactions offered.");
  return yes;
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export const CHANNEL_NAME_MAX = 40;
export const CHANNEL_TOPIC_MAX = 250;
export const GENERAL_CHANNEL = "general";

/**
 * A channel's name as it is stored: lower case, words joined by hyphens,
 * letters and digits of any language. "#Denver Sales!" becomes "denver-sales".
 */
export function validateChannelName(raw: unknown): { ok: true; name: string } | { ok: false; reason: string } {
  const name = (typeof raw === "string" ? raw : "")
    .normalize("NFKC")
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  if (!name) return { ok: false, reason: "Name the channel." };
  if (name.length > CHANNEL_NAME_MAX) return { ok: false, reason: `Keep the name under ${CHANNEL_NAME_MAX} characters.` };
  return { ok: true, name };
}

export function validateChannelTopic(raw: unknown): { ok: true; topic: string | null } | { ok: false; reason: string } {
  const topic = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (topic.length > CHANNEL_TOPIC_MAX) return { ok: false, reason: `Keep the topic under ${CHANNEL_TOPIC_MAX} characters.` };
  return { ok: true, topic: topic || null };
}

/** Channels are created, archived and managed by whoever runs team chats (the Messages area). */
export function canManageChannels(me: { role: Role; grants?: Grants | null; orgId: string | null }, orgId: string | null = me.orgId): Check {
  if (!me.orgId || me.orgId !== orgId || !canUse(me, "messages")) return no("Owners, recruiters and supervisors create and manage channels.");
  return yes;
}

export interface ChannelFacts {
  orgId: string;
  archived: boolean;
  isGeneral: boolean;
  /** My participant row there, if any. */
  participant: { role: ParticipantRole; removedAt: Date | null } | null;
}

/** Staff of the organization see its channels (to open or join); a worker sees only channels they were added to. */
export function isChannelStaff(me: { role: Role; orgId: string | null }, orgId: string): boolean {
  return me.role !== "WORKER" && !!me.orgId && me.orgId === orgId;
}

/** Staff join any live channel of their organization themselves. Workers are added by a manager, never by joining. */
export function canJoinChannel(me: { role: Role; orgId: string | null }, c: ChannelFacts): Check {
  if (!isChannelStaff(me, c.orgId)) return no("That channel isn't available.");
  if (c.archived) return no("This channel is archived.");
  if (c.participant && !c.participant.removedAt) return no("You're already in this channel.");
  return yes;
}

/** Anyone may leave a channel except the general one, which holds everyone on staff. */
export function canLeaveChannel(c: ChannelFacts): Check {
  if (!c.participant || c.participant.removedAt) return no("You're not in this channel.");
  if (c.isGeneral) return no("Everyone on staff stays in the general channel.");
  return yes;
}

// ---------------------------------------------------------------------------
// Attachments — types come from the file's bytes, never the name alone
// ---------------------------------------------------------------------------

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

/**
 * Plain text: no control bytes anywhere except tab, newlines, form feed and
 * escape. Any picture (or other binary) data has them, so an image appended
 * after a page of text can't pass as a .txt.
 */
const plainText = (bytes: Uint8Array) => !bytes.some((b) => b < 0x09 || (b > 0x0d && b < 0x20 && b !== 0x1b) || b === 0x7f);

/** Detects the real type from magic bytes. Returns null for anything not recognised. */
export function sniffType(bytes: Uint8Array, name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  // Checked first: a note that happens to start "BM…" or "GIF8…" is text,
  // since a real image header always has control bytes.
  if ((ext === "txt" || ext === "csv") && plainText(bytes)) return ext === "csv" ? "text/csv" : "text/plain";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (/^(hei[cmsx]|hev[cmsx]|mif[12]|msf1|miaf|avi[fs])$/.test(brand)) return "image/heic";
    return null; // other ISO media (video) — not allowed
  }
  if (startsWith(bytes, [0x42, 0x4d])) return "image/bmp";
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return "image/tiff";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return null; // other zip archives aren't allowed
  }
  return null;
}

const IMAGE_NAME = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?|svg|emf|wmf)$/i;
const PHOTO_REASON = `Photos can't be shared in Turfcut chats. ${PETITION_NOTICE}`;
/**
 * Policy: text documents only. Images are refused in every thread for the
 * pilot — every conversation is tied to petition work, and signed sheets
 * must never be photographed or shared (custody is metadata only).
 * This is the type-and-name check; the server also scans contents for
 * pictures inside documents (lib/attachment-scan.ts → vetAttachment).
 */
export function checkAttachment(file: { name: string; size: number; bytes: Uint8Array }): { ok: true; type: string } | { ok: false; reason: string } {
  if (file.size <= 0 || file.bytes.length === 0) return { ok: false, reason: "That file is empty." };
  if (file.size > MAX_ATTACHMENT_BYTES || file.bytes.length > MAX_ATTACHMENT_BYTES) return { ok: false, reason: "Files can be up to 4 MB." };
  // No slashes, control characters or text-direction overrides (which can
  // make "x‮gpj.txt" display as "xtxt.jpg").
  if (!/^[^/\\\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]{1,120}$/.test(file.name)) {
    return { ok: false, reason: "Rename the file (up to 120 characters, no slashes or special characters)." };
  }
  const type = sniffType(file.bytes, file.name);
  if (type?.startsWith("image/") || IMAGE_NAME.test(file.name)) return { ok: false, reason: PHOTO_REASON };
  if (!type) return { ok: false, reason: "Share PDFs, Word or Excel documents, or text files." };
  return { ok: true, type };
}
