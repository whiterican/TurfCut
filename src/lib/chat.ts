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
 * - Nothing here reads, infers or labels political fit or chat content.
 */
import type { Role } from "@/lib/auth";

/** Org roles that run teams: create group chats and act as managers. */
export const CHAT_STAFF_ROLES: Role[] = ["OWNER", "RECRUITER", "SUPERVISOR"];
const HIRED = new Set(["ACTIVE", "CLAIMED"]);

export const MAX_BODY = 4000;
export const EDIT_WINDOW_MS = 5 * 60_000;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const PETITION_NOTICE = "Do not photograph or share signed petition sheets. Custody is tracked as packet IDs and counts only.";

export type Kind = "DIRECT" | "GROUP";

export interface ChatFacts {
  kind: Kind;
  orgId: string;
  me: { profileId: string; role: Role; orgId: string | null };
  /** My participant row, if any. */
  participant: { role: "WORKER" | "MANAGER"; removedAt: Date | null } | null;
  /** DIRECT: the engagement's status. */
  engagementStatus?: string;
  /** GROUP, worker: hired (ACTIVE/CLAIMED) on at least one of the chat's jobs. */
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
  post: boolean;
  /** Why posting is closed, in plain words (null when open). */
  closed: string | null;
}

const NONE: Access = { read: false, readUntil: null, post: false, closed: "You're not in this conversation." };

export function chatAccess(f: ChatFacts): Access {
  const p = f.participant;
  if (!p) return NONE;
  if (p.removedAt) return { read: true, readUntil: p.removedAt, post: false, closed: "You were removed from this conversation. History is read-only." };
  const open = (): Access => ({ read: true, readUntil: null, post: true, closed: null });
  const frozen = (closed: string): Access => ({ read: true, readUntil: null, post: false, closed });

  if (p.role === "MANAGER") {
    if (f.me.orgId !== f.orgId || !CHAT_STAFF_ROLES.includes(f.me.role)) return frozen("You no longer manage this conversation. History is read-only.");
  }
  if (f.kind === "DIRECT") {
    if (!HIRED.has(f.engagementStatus ?? "")) return frozen("This job has ended. The conversation is read-only.");
    if (f.counterpartRemoved) return frozen("The other person has left this conversation. History is read-only.");
    if (f.blockedByOther) return frozen("You can't send messages in this conversation.");
    return open();
  }
  if (p.role === "WORKER" && !f.hiredOnLinkedJob) return frozen("You're no longer on a job for this team. History is read-only.");
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
}

export function viewMessages(messages: RawMessage[], revisions: RawRevision[], viewerId: string, blocks: Block[], readUntil: Date | null): ViewMessage[] {
  const byMsg = new Map<string, RawRevision[]>();
  for (const r of revisions) byMsg.set(r.messageId, [...(byMsg.get(r.messageId) ?? []), r]);
  // Hidden if sent while the viewer had that sender blocked — and it stays
  // hidden after unblocking (same rule as the Realtime RLS policy).
  const myBlocks = blocks.filter((b) => b.blockerId === viewerId);
  const blockedAt = (sender: string, at: Date) =>
    myBlocks.some((b) => b.blockedId === sender && b.createdAt <= at && (b.liftedAt === null || at < b.liftedAt));
  return messages
    .filter((m) => !readUntil || m.createdAt <= readUntil)
    .filter((m) => !blockedAt(m.senderId, m.createdAt))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((m) => {
      const revs = (byMsg.get(m.id) ?? [])
        .filter((r) => (!readUntil || r.createdAt <= readUntil) && !blockedAt(r.actorId, r.createdAt))
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
 * Soft delete: the sender (while they can read the thread), or the org owner
 * moderating a reported message. The original stays in the store and in
 * any report's snapshot.
 */
export function canDelete(access: Access, msg: ViewMessage, me: { profileId: string; role: Role; orgId: string | null }, orgId: string, reported: boolean): Check {
  if (msg.deleted) return no("That message is already deleted.");
  if (msg.senderId === me.profileId && access.read) return yes;
  if (me.role === "OWNER" && me.orgId === orgId && reported) return yes;
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
export function canBlock(me: { role: Role }, target: { role: "WORKER" | "MANAGER" } | null): Check {
  if (me.role !== "WORKER") return no("Only workers can block.");
  if (!target) return no("You don't share a conversation with that person.");
  if (target.role !== "MANAGER") return no("You can block employers and managers.");
  return yes;
}

/** Group members are managed by the chat's active managers and the org owner. */
export function canManageMembers(f: ChatFacts): Check {
  if (f.kind !== "GROUP") return no("Direct conversations have fixed members.");
  if (f.me.role === "OWNER" && f.me.orgId === f.orgId) return yes;
  const a = chatAccess(f);
  if (f.participant?.role === "MANAGER" && a.post) return yes;
  return no("Only this team's managers can add or remove members.");
}

export function canCreateGroup(me: { role: Role; orgId: string | null }): Check {
  if (!me.orgId || !CHAT_STAFF_ROLES.includes(me.role)) return no("Owners, recruiters and supervisors create team chats.");
  return yes;
}

export function validateGroupName(raw: unknown): { ok: true; name: string } | { ok: false; reason: string } {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) return { ok: false, reason: "Name the team chat." };
  if (name.length > 80) return { ok: false, reason: "Keep the name under 80 characters." };
  return { ok: true, name };
}

// ---------------------------------------------------------------------------
// Attachments — types come from the file's bytes, never the name alone
// ---------------------------------------------------------------------------

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

/** Detects the real type from magic bytes. Returns null for anything not recognised. */
export function sniffType(bytes: Uint8Array, name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
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
  if ((ext === "txt" || ext === "csv") && !bytes.slice(0, 4096).includes(0)) return ext === "csv" ? "text/csv" : "text/plain";
  return null;
}

/** Entry names from a zip's central directory, or null if it isn't a plain zip we can read. */
export function zipEntries(b: Uint8Array): string[] | null {
  const u16 = (o: number) => b[o] | (b[o + 1] << 8);
  const u32 = (o: number) => (u16(o) | (u16(o + 2) << 16)) >>> 0;
  // End-of-central-directory record: within the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = u16(eocd + 10);
  let at = u32(eocd + 16);
  if (count === 0xffff || at === 0xffffffff) return null; // zip64: not supported
  const names: string[] = [];
  for (let n = 0; n < count; n++) {
    if (at + 46 > b.length || u32(at) !== 0x02014b50) return null;
    const [nameLen, extraLen, commentLen] = [u16(at + 28), u16(at + 30), u16(at + 32)];
    if (at + 46 + nameLen > b.length) return null;
    names.push(new TextDecoder().decode(b.subarray(at + 46, at + 46 + nameLen)));
    at += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

const IMAGE_NAME = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?|svg|emf|wmf)$/i;
const OOXML_PART = /^(\[Content_Types\]\.xml|_rels\/|docProps\/|customXml\/|word\/|xl\/)/;
const PHOTO_REASON = `Photos can't be shared in Turfcut chats. ${PETITION_NOTICE}`;
const PICTURES_REASON = `This document has pictures in it, and Turfcut chats share text-only documents. ${PETITION_NOTICE}`;

/** Why a document's contents are refused (embedded or disguised pictures), or null. */
function contentProblem(type: string, bytes: Uint8Array): string | null {
  if (type === "application/pdf") {
    // Image XObjects are streams, which can't sit inside compressed object
    // streams, so their dictionaries are always plain text. Undo #xx name
    // escapes first (/Subtype/#49mage).
    const text = new TextDecoder("latin1").decode(bytes).replace(/#([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return /\/Subtype\s*\/Image\b/.test(text) || /\bBI\s*\/W\s/.test(text) ? PICTURES_REASON : null;
  }
  if (type.startsWith("application/vnd.openxmlformats")) {
    const names = zipEntries(bytes);
    const main = type.includes("wordprocessing") ? "word/" : "xl/";
    if (!names || !names.includes("[Content_Types].xml") || !names.some((n) => n.startsWith(main))) return "That file isn't a real Word or Excel document.";
    if (names.some((n) => !OOXML_PART.test(n))) return "That file isn't a real Word or Excel document.";
    if (names.some((n) => /\/media\/|\/embeddings\//.test(n) || IMAGE_NAME.test(n))) return PICTURES_REASON;
    return null;
  }
  // Text: no pictures smuggled in as SVG, data URIs or long base64 runs.
  const text = new TextDecoder().decode(bytes);
  if (/<svg[\s>]|data:image\/|[A-Za-z0-9+/]{1000,}/i.test(text)) return PICTURES_REASON;
  return null;
}

/**
 * Policy: text documents only. Images are refused in every thread for the
 * pilot — every conversation is tied to petition work, and signed sheets
 * must never be photographed or shared (custody is metadata only). That
 * includes pictures inside documents: scanned PDFs, Word/Excel files with
 * embedded images, and zips renamed to .docx.
 */
export function checkAttachment(file: { name: string; size: number; bytes: Uint8Array }): { ok: true; type: string } | { ok: false; reason: string } {
  if (file.size <= 0 || file.bytes.length === 0) return { ok: false, reason: "That file is empty." };
  if (file.size > MAX_ATTACHMENT_BYTES || file.bytes.length > MAX_ATTACHMENT_BYTES) return { ok: false, reason: "Files can be up to 10 MB." };
  // No slashes, control characters or text-direction overrides (which can
  // make "x‮gpj.txt" display as "xtxt.jpg").
  if (!/^[^/\\\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]{1,120}$/.test(file.name)) {
    return { ok: false, reason: "Rename the file (up to 120 characters, no slashes or special characters)." };
  }
  const type = sniffType(file.bytes, file.name);
  if (type?.startsWith("image/") || IMAGE_NAME.test(file.name)) return { ok: false, reason: PHOTO_REASON };
  if (!type) return { ok: false, reason: "Share PDFs, Word or Excel documents, or text files." };
  const problem = contentProblem(type, file.bytes);
  if (problem) return { ok: false, reason: problem };
  return { ok: true, type };
}
