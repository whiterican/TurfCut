import { describe, expect, it } from "vitest";
import {
  canBlock,
  canCreateGroup,
  canDelete,
  canEdit,
  canManageMembers,
  canReport,
  canSend,
  chatAccess,
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
  const mine = { id: "m", senderId: "w", createdAt: t(0), body: "hello", edited: false, deleted: false, attachment: null };

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
  it("refuses file names that disguise their type", () => {
    expect(doc("inv\u202egpj.txt", new TextEncoder().encode("hi")).ok).toBe(false);
    expect(doc("a/b.txt", new TextEncoder().encode("hi")).ok).toBe(false);
  });
});
