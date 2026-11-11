import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canBlock,
  canCreateGroup,
  canJoinChannel,
  canLeaveChannel,
  canManageChannels,
  isChannelStaff,
  REACTIONS,
  REACTION_NAMES,
  validateChannelName,
  validateChannelTopic,
  canDelete,
  canEdit,
  canManageMembers,
  canReact,
  canReply,
  canReport,
  canSend,
  canStartStaffDm,
  chatAccess,
  dmKey,
  findMentions,
  checkAttachment,
  unreadCount,
  viewMessages,
  type ChatFacts,
  type RawMessage,
} from "./chat";

const ORG = "org-1";
const t = (min: number) => new Date(Date.UTC(2026, 9, 5, 15, min));
const worker = { profileId: "w", role: "WORKER" as const, orgId: null };
const boss = { profileId: "boss", role: "RECRUITER" as const, orgId: ORG };
const direct = (over: Partial<ChatFacts> = {}): ChatFacts => ({ kind: "DIRECT", orgId: ORG, me: worker, participant: { role: "WORKER", removedAt: null }, engagementStatus: "ACTIVE", ...over });
const group = (over: Partial<ChatFacts> = {}): ChatFacts => ({ kind: "GROUP", orgId: ORG, me: worker, participant: { role: "WORKER", removedAt: null }, hiredOnLinkedJob: true, ...over });

describe("access — who can read and post", () => {
  it("non-participants can neither read nor write", () => {
    const a = chatAccess(direct({ participant: null }));
    expect(a).toMatchObject({ read: false, post: false });
    expect(canSend(a, "hi", false)).toEqual({ ok: false, reason: "You're not in this conversation." });
  });

  it("a direct thread is open only while the hire is", () => {
    expect(chatAccess(direct()).post).toBe(true);
    expect(chatAccess(direct({ engagementStatus: "CLAIMED" })).post).toBe(true);
    for (const s of ["APPLIED", "INVITED", "COMPLETED", "CANCELLED"]) {
      expect(chatAccess(direct({ engagementStatus: s }))).toMatchObject({ read: true, post: false });
    }
    expect(canSend(chatAccess(direct({ engagementStatus: "COMPLETED" })), "hi", false)).toEqual({ ok: false, reason: "This job has ended. The conversation is read-only." });
  });

  it("a blocked manager can't post to the worker who blocked them", () => {
    const a = chatAccess(direct({ me: boss, participant: { role: "MANAGER", removedAt: null }, blockedByOther: true }));
    expect(a).toMatchObject({ read: true, post: false });
  });

  it("managers lose posting when they leave the org or the staff roles", () => {
    expect(chatAccess(direct({ me: { ...boss, orgId: "other" }, participant: { role: "MANAGER", removedAt: null } })).post).toBe(false);
    expect(chatAccess(direct({ me: { ...boss, role: "FINANCE" }, participant: { role: "MANAGER", removedAt: null } })).post).toBe(false);
  });

  it("removed members keep read-only history up to their removal", () => {
    expect(chatAccess(group({ participant: { role: "WORKER", removedAt: t(30) } }))).toEqual({
      read: true,
      readUntil: t(30),
      readFrom: null,
      post: false,
      closed: "You were removed from this conversation. History is read-only.",
    });
  });

  it("a direct thread freezes when the other person has left", () => {
    expect(chatAccess(direct({ counterpartRemoved: true }))).toMatchObject({ read: true, post: false });
  });

  it("group workers post only while hired on one of the team's jobs", () => {
    expect(chatAccess(group()).post).toBe(true);
    expect(chatAccess(group({ hiredOnLinkedJob: false }))).toMatchObject({ read: true, post: false });
  });
});

describe("what a viewer sees", () => {
  const m = (id: string, sender: string, min: number, body = id): RawMessage => ({ id, senderId: sender, body, createdAt: t(min), attachment: null });
  const msgs = [m("a", "boss", 1), m("b", "w", 2), m("c", "sup", 10), m("d", "boss", 40)];

  it("applies edits and tombstones without losing the original", () => {
    const v = viewMessages(msgs, [
      { messageId: "a", actorId: "boss", kind: "EDIT", body: "a2", createdAt: t(2) },
      { messageId: "a", actorId: "boss", kind: "EDIT", body: "a3", createdAt: t(3) },
      { messageId: "b", actorId: "w", kind: "DELETE", body: null, createdAt: t(4) },
    ], "w", [], null);
    expect(v.find((x) => x.id === "a")).toMatchObject({ body: "a3", edited: true, deleted: false });
    expect(v.find((x) => x.id === "b")).toMatchObject({ body: null, deleted: true, edited: false });
    expect(msgs[0].body).toBe("a"); // the stored row is untouched
  });

  it("hides what a blocked sender sends while blocked — before and after unblocking", () => {
    const block = { blockerId: "w", blockedId: "sup", createdAt: t(5), liftedAt: null };
    expect(viewMessages(msgs, [], "w", [block], null).map((x) => x.id)).toEqual(["a", "b", "d"]);
    expect(viewMessages(msgs, [], "boss", [block], null).map((x) => x.id)).toEqual(["a", "b", "c", "d"]); // others unaffected
    // Unblocking doesn't resurface what was sent during the block; later messages show.
    expect(viewMessages([...msgs, m("e", "sup", 55)], [], "w", [{ ...block, liftedAt: t(50) }], null).map((x) => x.id)).toEqual(["a", "b", "d", "e"]);
  });

  it("hides edits a blocked sender makes while blocked (same rule as Realtime)", () => {
    const block = { blockerId: "w", blockedId: "boss", createdAt: t(5), liftedAt: null };
    const v = viewMessages(msgs, [{ messageId: "a", actorId: "boss", kind: "EDIT", body: "sneaky", createdAt: t(6) }], "w", [block], null);
    expect(v.find((x) => x.id === "a")).toMatchObject({ body: "a", edited: false });
  });

  it("applies a deletion even by someone the viewer blocked (a tombstone has no content)", () => {
    // The worker blocked the owner; the owner removes a reported message.
    const block = { blockerId: "w", blockedId: "boss", createdAt: t(5), liftedAt: null };
    const v = viewMessages(msgs, [{ messageId: "c", actorId: "boss", kind: "DELETE", body: null, createdAt: t(20) }], "w", [block], null);
    expect(v.find((x) => x.id === "c")).toMatchObject({ body: null, deleted: true });
  });

  it("a contact who takes over a direct thread sees it only from when they joined", () => {
    const a = chatAccess(direct({ me: boss, participant: { role: "MANAGER", removedAt: null, addedAt: t(5) } }));
    expect(a.readFrom).toEqual(t(5));
    expect(viewMessages(msgs, [], "boss", [], null, a.readFrom).map((x) => x.id)).toEqual(["c", "d"]);
    // Team chats keep full history for new members.
    expect(chatAccess(group({ me: boss, participant: { role: "MANAGER", removedAt: null, addedAt: t(5) } })).readFrom).toBeNull();
  });

  it("cuts history at removal, including later edits", () => {
    const v = viewMessages(msgs, [{ messageId: "a", actorId: "boss", kind: "EDIT", body: "after", createdAt: t(35) }], "w", [], t(30));
    expect(v.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(v[0].body).toBe("a");
  });

  it("counts unread messages from others after my last read", () => {
    const v = viewMessages(msgs, [], "w", [], null);
    expect(unreadCount(v, "w", t(5))).toBe(2);
    expect(unreadCount(v, "w", null)).toBe(3);
  });
});

describe("writes", () => {
  const open = chatAccess(direct());
  const mine = { id: "m", senderId: "w", createdAt: t(0), body: "hello", edited: false, deleted: false, attachment: null, parentId: null };

  it("edits own messages within 5 minutes only", () => {
    expect(canEdit(open, mine, "w", "hello!", t(4))).toEqual({ ok: true });
    expect(canEdit(open, mine, "w", "hello!", t(6))).toEqual({ ok: false, reason: "Messages can be edited for 5 minutes after sending." });
    expect(canEdit(open, mine, "boss", "x", t(1)).ok).toBe(false);
    expect(canEdit(chatAccess(direct({ engagementStatus: "COMPLETED" })), mine, "w", "x", t(1)).ok).toBe(false);
  });

  it("deletes: sender, or the org owner for a reported message", () => {
    expect(canDelete(open, mine, worker, ORG, false).ok).toBe(true);
    expect(canDelete(open, mine, boss, ORG, true).ok).toBe(false);
    expect(canDelete(open, mine, { profileId: "own", role: "OWNER", orgId: ORG }, ORG, false).ok).toBe(false);
    expect(canDelete(open, mine, { profileId: "own", role: "OWNER", orgId: ORG }, ORG, true).ok).toBe(true);
    // Read-only members can't change history, even their own messages.
    expect(canDelete(chatAccess(direct({ engagementStatus: "COMPLETED" })), mine, worker, ORG, false).ok).toBe(false);
    expect(canDelete(chatAccess(direct({ participant: { role: "WORKER", removedAt: t(9) } })), mine, worker, ORG, false).ok).toBe(false);
  });

  it("reports others' messages with a reason; blocks managers only", () => {
    const theirs = { ...mine, senderId: "boss" };
    expect(canReport(open, theirs, "w", "abusive").ok).toBe(true);
    expect(canReport(open, mine, "w", "x").ok).toBe(false);
    expect(canReport(chatAccess(direct({ participant: null })), theirs, "w", "x").ok).toBe(false);
    expect(canBlock(worker, { role: "MANAGER" }).ok).toBe(true);
    expect(canBlock(worker, { role: "WORKER" }).ok).toBe(false);
    expect(canBlock(boss, { role: "WORKER" }).ok).toBe(false);
  });

  it("group membership is managed by the team's managers and the owner — never workers", () => {
    expect(canManageMembers(group()).ok).toBe(false);
    expect(canManageMembers(group({ me: boss, participant: { role: "MANAGER", removedAt: null } })).ok).toBe(true);
    expect(canManageMembers(group({ me: { profileId: "own", role: "OWNER", orgId: ORG }, participant: null })).ok).toBe(true);
    expect(canManageMembers(direct({ me: boss, participant: { role: "MANAGER", removedAt: null } })).ok).toBe(false);
    expect(canCreateGroup(boss).ok).toBe(true);
    expect(canCreateGroup({ role: "FINANCE", orgId: ORG }).ok).toBe(false);
    expect(canCreateGroup(worker).ok).toBe(false);
  });
});

describe("attachments", () => {
  const f = (name: string, head: number[], size = 2000) => ({ name, size, bytes: new Uint8Array([...head, ...new Array(16).fill(65)]) });
  it("rejects photos everywhere with the petition-sheet notice — by bytes, not just the name", () => {
    const jpg = checkAttachment(f("scan.pdf", [0xff, 0xd8, 0xff, 0xe0])); // a JPEG renamed .pdf
    expect(jpg.ok).toBe(false);
    expect(!jpg.ok && jpg.reason).toMatch(/Do not photograph or share signed petition sheets/);
    expect(checkAttachment(f("IMG_0001.HEIC", [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])).ok).toBe(false);
    expect(checkAttachment(f("sheet.png", [0x89, 0x50, 0x4e, 0x47])).ok).toBe(false);
  });
  it("accepts documents and refuses unknown or oversized files", () => {
    expect(checkAttachment(f("training.pdf", [0x25, 0x50, 0x44, 0x46]))).toEqual({ ok: true, type: "application/pdf" });
    expect(checkAttachment(f("tool.zip", [0x50, 0x4b, 0x03, 0x04])).ok).toBe(false);
    expect(checkAttachment(f("notes.txt", [104, 105])).ok).toBe(true);
    expect(checkAttachment(f("run.exe", [0x4d, 0x5a])).ok).toBe(false);
    expect(checkAttachment(f("big.pdf", [0x25, 0x50, 0x44, 0x46], 11 * 1024 * 1024)).ok).toBe(false);
  });
  const doc = (name: string, bytes: Uint8Array) => checkAttachment({ name, size: bytes.length, bytes });
  it("reads a text file as text even if it starts like an image header", () => {
    expect(doc("notes.txt", new TextEncoder().encode("BMW dealership on 5th — skip"))).toEqual({ ok: true, type: "text/plain" });
    expect(doc("notes.txt", new TextEncoder().encode("GIF89a is the old format, ignore"))).toEqual({ ok: true, type: "text/plain" });
  });
  it("refuses a text file with binary data anywhere (a photo appended to notes)", () => {
    const notes = new TextEncoder().encode("x".repeat(5000));
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
    expect(doc("notes.txt", new Uint8Array([...notes, ...photo])).ok).toBe(false);
  });
  it("refuses file names that disguise their type", () => {
    expect(doc("inv\u202egpj.txt", new TextEncoder().encode("hi")).ok).toBe(false);
    expect(doc("a/b.txt", new TextEncoder().encode("hi")).ok).toBe(false);
  });
});

describe("channels", () => {
  const finance = { profileId: "fin", role: "FINANCE" as const, orgId: ORG };
  const channel = (over: Partial<ChatFacts> = {}): ChatFacts => ({ kind: "CHANNEL", orgId: ORG, me: finance, participant: { role: "MEMBER", removedAt: null }, ...over });

  it("any staff role posts in a channel it is in: no Messages area needed", () => {
    for (const role of ["OWNER", "RECRUITER", "SUPERVISOR", "COMPLIANCE", "FINANCE", "PUBLISHER"] as const) {
      expect(chatAccess(channel({ me: { profileId: "x", role, orgId: ORG } }))).toMatchObject({ read: true, post: true, closed: null });
    }
    // A custom role with no grants at all is still on staff.
    expect(chatAccess(channel({ me: { profileId: "x", role: "CUSTOM", grants: {}, orgId: ORG } }))).toMatchObject({ read: true, post: true });
  });

  it("someone not in the channel reads nothing, staff or not", () => {
    expect(chatAccess(channel({ participant: null }))).toMatchObject({ read: false, post: false });
  });

  it("a member who left the organization, or whose login became a worker, reads nothing more", () => {
    expect(chatAccess(channel({ me: { ...finance, orgId: "other-org" } }))).toMatchObject({ read: false, post: false });
    expect(chatAccess(channel({ me: { ...finance, orgId: null } }))).toMatchObject({ read: false, post: false });
    expect(chatAccess(channel({ me: { profileId: "fin", role: "WORKER", orgId: ORG } }))).toMatchObject({ read: false, post: false });
  });

  it("a staff MEMBER row means nothing outside a channel", () => {
    expect(chatAccess({ kind: "GROUP", orgId: ORG, me: finance, participant: { role: "MEMBER", removedAt: null } })).toMatchObject({ read: false, post: false });
  });

  it("an archived channel is read-only for everyone in it", () => {
    expect(chatAccess(channel({ archived: true }))).toMatchObject({ read: true, post: false, closed: "This channel is archived. History is read-only." });
    expect(chatAccess(channel({ archived: true, me: worker, participant: { role: "WORKER", removedAt: null }, hiredOnLinkedJob: true }))).toMatchObject({ read: true, post: false });
  });

  it("a worker posts in a channel only while hired on one of its jobs", () => {
    const w = { me: worker, participant: { role: "WORKER" as const, removedAt: null } };
    expect(chatAccess(channel({ ...w, hiredOnLinkedJob: true }))).toMatchObject({ read: true, post: true });
    expect(chatAccess(channel({ ...w, hiredOnLinkedJob: false }))).toMatchObject({ read: true, post: false, closed: "You're no longer on a job for this channel. History is read-only." });
  });

  it("someone who left keeps read-only history up to then, while still on the organization's staff", () => {
    const left = { role: "MEMBER" as const, removedAt: t(5) };
    expect(chatAccess(channel({ participant: left }))).toMatchObject({ read: true, readUntil: t(5), post: false });
    // No longer on that staff (another organization, none, or now a worker): nothing, not even the history.
    expect(chatAccess(channel({ participant: left, me: { ...finance, orgId: "other-org" } }))).toMatchObject({ read: false, post: false });
    expect(chatAccess(channel({ participant: left, me: { ...finance, orgId: null } }))).toMatchObject({ read: false, post: false });
    expect(chatAccess(channel({ participant: left, me: { profileId: "fin", role: "WORKER", orgId: null } }))).toMatchObject({ read: false, post: false });
  });

  it("channels are created and managed by those who run teams, in their own organization only", () => {
    expect(canManageChannels(boss).ok).toBe(true);
    expect(canManageChannels({ role: "OWNER", orgId: ORG }).ok).toBe(true);
    expect(canManageChannels(finance).ok).toBe(false);
    expect(canManageChannels(worker).ok).toBe(false);
    expect(canManageChannels(boss, "other-org").ok).toBe(false);
    expect(canManageChannels({ role: "CUSTOM", grants: { messages: "full" }, orgId: ORG }).ok).toBe(true);
    // Members of a channel are managed the same way, in the channel or not.
    expect(canManageMembers(channel({ me: boss, participant: null })).ok).toBe(true);
    expect(canManageMembers(channel()).ok).toBe(false);
    expect(canManageMembers(channel({ me: { ...boss, orgId: "other-org" }, participant: null })).ok).toBe(false);
  });

  it("staff join their own organization's live channels; workers and outsiders never join by themselves", () => {
    const c = { orgId: ORG, archived: false, isGeneral: false, participant: null };
    expect(isChannelStaff(finance, ORG)).toBe(true);
    expect(canJoinChannel(finance, c).ok).toBe(true);
    expect(canJoinChannel(worker, c).ok).toBe(false);
    expect(canJoinChannel({ role: "WORKER", orgId: ORG }, c).ok).toBe(false);
    expect(canJoinChannel({ role: "OWNER", orgId: "other-org" }, c).ok).toBe(false);
    expect(canJoinChannel(finance, { ...c, archived: true }).ok).toBe(false);
    expect(canJoinChannel(finance, { ...c, participant: { role: "MEMBER", removedAt: null } }).ok).toBe(false);
    // Someone who left may come back.
    expect(canJoinChannel(finance, { ...c, participant: { role: "MEMBER", removedAt: t(1) } }).ok).toBe(true);
  });

  it("anyone leaves a channel except the general one", () => {
    const mine = { role: "MEMBER" as const, removedAt: null };
    expect(canLeaveChannel({ orgId: ORG, archived: false, isGeneral: false, participant: mine }).ok).toBe(true);
    expect(canLeaveChannel({ orgId: ORG, archived: false, isGeneral: true, participant: mine })).toEqual({ ok: false, reason: "Everyone on staff stays in the general channel." });
    expect(canLeaveChannel({ orgId: ORG, archived: false, isGeneral: false, participant: null }).ok).toBe(false);
  });

  it("a worker may block staff they share a channel with, never a fellow worker", () => {
    expect(canBlock({ role: "WORKER" }, { role: "MEMBER" }).ok).toBe(true);
    expect(canBlock({ role: "WORKER" }, { role: "MANAGER" }).ok).toBe(true);
    expect(canBlock({ role: "WORKER" }, { role: "WORKER" }).ok).toBe(false);
  });

  it("stores a channel name lower case with hyphens, in any language, and refuses an empty or over-long one", () => {
    expect(validateChannelName("  #Denver Sales! ")).toEqual({ ok: true, name: "denver-sales" });
    expect(validateChannelName("door_to_door / team 2")).toEqual({ ok: true, name: "door-to-door-team-2" });
    expect(validateChannelName("Équipe Montréal")).toEqual({ ok: true, name: "équipe-montréal" });
    expect(validateChannelName("###").ok).toBe(false);
    expect(validateChannelName(42).ok).toBe(false);
    expect(validateChannelName("a".repeat(41)).ok).toBe(false);
    expect(validateChannelName("a".repeat(40)).ok).toBe(true);
    // Nothing that could be markup or a path survives.
    expect(validateChannelName("<script>../x")).toEqual({ ok: true, name: "script-x" });
  });

  it("a topic is optional, one line, and at most 250 characters", () => {
    expect(validateChannelTopic("  Daily   numbers\nand questions ")).toEqual({ ok: true, topic: "Daily numbers and questions" });
    expect(validateChannelTopic("")).toEqual({ ok: true, topic: null });
    expect(validateChannelTopic(undefined)).toEqual({ ok: true, topic: null });
    expect(validateChannelTopic("x".repeat(251)).ok).toBe(false);
  });
});

describe("threads and reactions", () => {
  const open = chatAccess(group());
  const frozen = chatAccess(group({ hiredOnLinkedJob: false }));
  const top = { id: "m", senderId: "boss", createdAt: t(0), body: "Who has Elm Street?", edited: false, deleted: false, attachment: null, parentId: null };
  const reply = { ...top, id: "r", parentId: "m" };

  it("anyone who may post replies under a message they can see", () => {
    expect(canReply(open, top).ok).toBe(true);
    expect(canReply(open, null)).toEqual({ ok: false, reason: "That message isn't available." });
  });

  it("threads are one level deep: a reply is not replied to", () => {
    expect(canReply(open, reply)).toEqual({ ok: false, reason: "Reply in the thread, not to a reply." });
  });

  it("a deleted message can still be answered (its thread outlives it), but not reacted to", () => {
    const gone = { ...top, body: null, deleted: true };
    expect(canReply(open, gone).ok).toBe(true);
    expect(canReact(open, gone, REACTIONS[0]).ok).toBe(false);
  });

  it("someone who can no longer post neither replies nor reacts, and is told why", () => {
    expect(canReply(frozen, top)).toEqual({ ok: false, reason: "You're no longer on a job for this team. History is read-only." });
    expect(canReact(frozen, top, REACTIONS[0]).ok).toBe(false);
    expect(canReact(chatAccess(direct({ participant: null })), top, REACTIONS[0]).ok).toBe(false);
  });

  it("a reaction is one of the fixed marks, nothing else", () => {
    for (const r of REACTIONS) expect(canReact(open, top, r).ok).toBe(true);
    for (const bad of ["", "x", "\u{1F4A9}", "\u{1F44D}\u{1F44D}", "<b>", null, 1]) expect(canReact(open, top, bad).ok).toBe(false);
    expect(REACTIONS.length).toBe(6);
    expect(Object.keys(REACTION_NAMES).sort()).toEqual([...REACTIONS].sort());
  });

  it("the database checks the same marks", () => {
    const sql = readFileSync(join(process.cwd(), "prisma/p2-threads.sql"), "utf8");
    const listed = sql.match(/CHECK \("emoji" IN \(([^)]*)\)\)/)?.[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
    expect(listed).toEqual([...REACTIONS]);
  });
});

describe("staff conversations (one to one)", () => {
  const fin = { profileId: "fin", role: "FINANCE" as const, orgId: ORG };
  const dm = (over: Partial<ChatFacts> = {}): ChatFacts => ({ kind: "STAFF_DM", orgId: ORG, me: fin, participant: { role: "MEMBER", removedAt: null }, ...over });
  const person = (over: Partial<{ profileId: string; role: "OWNER" | "WORKER" | "COMPLIANCE"; orgId: string | null; closed: boolean }> = {}) => ({ profileId: "comp", role: "COMPLIANCE" as const, orgId: ORG, closed: false, ...over });

  it("any two staff members of one organization may talk, whatever their roles", () => {
    expect(canStartStaffDm(fin, person()).ok).toBe(true);
    expect(canStartStaffDm(fin, person({ role: "OWNER" })).ok).toBe(true);
    expect(chatAccess(dm())).toMatchObject({ read: true, post: true });
  });

  it("never with a worker, someone in another organization, a closed account, or yourself", () => {
    expect(canStartStaffDm(fin, person({ role: "WORKER" })).ok).toBe(false);
    expect(canStartStaffDm(fin, person({ orgId: "other-org" })).ok).toBe(false);
    expect(canStartStaffDm(fin, person({ orgId: null })).ok).toBe(false);
    expect(canStartStaffDm(fin, person({ closed: true })).ok).toBe(false);
    expect(canStartStaffDm(fin, person({ profileId: "fin" })).ok).toBe(false);
    expect(canStartStaffDm(fin, null).ok).toBe(false);
    expect(canStartStaffDm(worker, person()).ok).toBe(false);
    expect(canStartStaffDm({ ...fin, orgId: null }, person()).ok).toBe(false);
  });

  it("a pair has one key, whoever starts", () => {
    expect(dmKey("b", "a")).toBe("a:b");
    expect(dmKey("a", "b")).toBe(dmKey("b", "a"));
  });

  it("nobody else reads it: not a manager, not a worker, not someone outside it", () => {
    expect(chatAccess(dm({ participant: null }))).toMatchObject({ read: false, post: false });
    expect(chatAccess(dm({ me: boss, participant: { role: "MANAGER", removedAt: null } }))).toMatchObject({ read: false, post: false });
    expect(chatAccess(dm({ me: worker, participant: { role: "WORKER", removedAt: null } }))).toMatchObject({ read: false, post: false });
    expect(canManageMembers(dm({ me: { profileId: "o", role: "OWNER", orgId: ORG }, participant: null })).ok).toBe(false);
  });

  it("when the other person leaves the organization it turns read-only; the one who left reads nothing", () => {
    expect(chatAccess(dm({ counterpartRemoved: true }))).toMatchObject({ read: true, post: false, closed: "This person is no longer in your organization. History is read-only." });
    expect(chatAccess(dm({ me: { ...fin, orgId: null }, participant: { role: "MEMBER", removedAt: t(3) } }))).toMatchObject({ read: false, post: false });
    expect(chatAccess(dm({ me: { profileId: "fin", role: "WORKER", orgId: null } }))).toMatchObject({ read: false, post: false });
  });
});

describe("mentions", () => {
  const people = [
    { profileId: "sam", name: "Sam" },
    { profileId: "samo", name: "Sam Ortiz" },
    { profileId: "maya", name: "Maya Chen" },
    { profileId: "maya2", name: "maya chen" },
    { profileId: "o", name: "Owner" },
  ];

  it("names a person by @Name, whatever the letter case", () => {
    expect(findMentions("thanks @maya chen!", people).sort()).toEqual(["maya", "maya2"]);
    expect(findMentions("@OWNER can you approve?", people)).toEqual(["o"]);
  });

  it("the longer name wins: @Sam Ortiz is not also Sam", () => {
    expect(findMentions("@Sam Ortiz has Elm Street", people)).toEqual(["samo"]);
    expect(findMentions("@Sam and @Sam Ortiz", people).sort()).toEqual(["sam", "samo"]);
  });

  it("a name inside a longer word, or an email address, names nobody", () => {
    expect(findMentions("@Samantha is new", people)).toEqual([]);
    expect(findMentions("mail me at x@sam.org", people)).toEqual([]);
    expect(findMentions("@Sam, are you there?", people)).toEqual(["sam"]);
    expect(findMentions("(@Sam)", people)).toEqual(["sam"]);
  });

  it("only people passed in can be named, and a plain name without @ names nobody", () => {
    expect(findMentions("Sam Ortiz was here, @Nobody", people)).toEqual([]);
    expect(findMentions("@Sam", [])).toEqual([]);
    expect(findMentions("@", people)).toEqual([]);
  });

  it("each person once, however often they are named", () => {
    expect(findMentions("@Sam @Sam @sam", people)).toEqual(["sam"]);
  });
});

describe("the participant guard in SQL", () => {
  it("is defined word for word the same in both migrations, so re-running either never undoes the other", () => {
    const fn = (file: string) => readFileSync(join(process.cwd(), "prisma", file), "utf8").match(/CREATE OR REPLACE FUNCTION "turfcut_private"\."check_channel_participant"\(\)[\s\S]*?\nEND \$\$;/g) ?? [];
    const a = fn("p2-channels.sql");
    const b = fn("p2-dm-mentions.sql");
    const setup = fn("supabase-manual-setup.sql");
    expect(a.length).toBe(1);
    expect(b).toEqual(a);
    expect(setup).toEqual([a[0], a[0]]);
    expect(a[0]).toContain("STAFF_DM");
  });

  it("and so is the check on what each kind of conversation looks like", () => {
    const chk = (file: string) => (readFileSync(join(process.cwd(), "prisma", file), "utf8").match(/ADD CONSTRAINT "Conversation_kind_shape" CHECK \([\s\S]*?\)\);/g) ?? []).filter((c) => c.includes("::text"));
    const a = chk("p2-channels.sql");
    expect(a.length).toBe(1);
    expect(chk("p2-dm-mentions.sql")).toEqual(a);
    expect(a[0]).toContain("STAFF_DM");
  });
});

