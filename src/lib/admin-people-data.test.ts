import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  orgInvite: { findUnique: vi.fn(), updateMany: vi.fn() },
  profile: { findUnique: vi.fn(), update: vi.fn() },
  auditEvent: { create: vi.fn() },
  adminAction: { create: vi.fn<(args: { data: Record<string, unknown> }) => Promise<{ id: string }>>() },
  $queryRaw: vi.fn(),
};
const client = { profile: { findMany: vi.fn() }, $queryRaw: vi.fn(), $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
const lockOrg = vi.fn();
const otherOwners = vi.fn();
const emailsFor = vi.fn<(ids: string[]) => Promise<Map<string, string>>>();
const orgIdsByCampaignHandle = vi.fn<(q: string) => Promise<string[]>>();
vi.mock("@/lib/db", () => ({ db: () => client }));
vi.mock("@/lib/members-data", () => ({ emailsFor: (ids: string[]) => emailsFor(ids), INVITE_DAYS: 7, LAST_OWNER: "An organization needs at least one owner. Make someone else an owner first.", lockOrg: (...a: unknown[]) => lockOrg(...a), otherOwners: (...a: unknown[]) => otherOwners(...a) }));
vi.mock("@/lib/campaign-admin-data", () => ({ orgIdsByCampaignHandle: (q: string) => orgIdsByCampaignHandle(q) }));

const { queryKind, searchPeople, staffRemoveMember, staffResendInvite } = await import("./admin-people-data");

const staff = { userId: "11111111-1111-1111-1111-111111111111", staff: true as const };
const ORG = "22222222-2222-2222-2222-222222222222";
const P = "33333333-3333-3333-3333-333333333333";
const INV = "44444444-4444-4444-4444-444444444444";
const now = new Date("2026-10-20T18:00:00Z");

describe("the people lookup and support actions (M10.4)", () => {
  beforeEach(() => {
    for (const m of [tx.orgInvite.findUnique, tx.orgInvite.updateMany, tx.profile.findUnique, tx.profile.update, tx.auditEvent.create, tx.adminAction.create, tx.$queryRaw, client.profile.findMany, client.$queryRaw, lockOrg, otherOwners, emailsFor, orgIdsByCampaignHandle]) m.mockReset();
    tx.adminAction.create.mockResolvedValue({ id: "ledger-1" });
    tx.auditEvent.create.mockResolvedValue({});
    tx.profile.update.mockResolvedValue({});
    tx.orgInvite.updateMany.mockResolvedValue({ count: 1 });
    tx.$queryRaw.mockResolvedValue([]);
    client.profile.findMany.mockResolvedValue([]);
    client.$queryRaw.mockResolvedValue([]);
    emailsFor.mockResolvedValue(new Map());
    orgIdsByCampaignHandle.mockResolvedValue([]);
  });

  it("tells an id, a handle, an email and a name apart", () => {
    expect(queryKind(P)).toBe("id");
    expect(queryKind("@frontrange")).toBe("handle");
    expect(queryKind("riley@boulder.test")).toBe("email");
    expect(queryKind("Riley Park")).toBe("name");
  });

  it("searches by the kind it sees: an email prefix through the sign-in table, a handle through the organization, a name through both display names", async () => {
    expect(await searchPeople("r")).toEqual({ kind: null, hits: [] });
    client.$queryRaw.mockResolvedValueOnce([{ id: P }]);
    await searchPeople("riley@bou");
    expect(client.profile.findMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: [P] } } });
    orgIdsByCampaignHandle.mockResolvedValueOnce([ORG]);
    await searchPeople("@front");
    expect(client.profile.findMany.mock.calls[1][0]).toMatchObject({ where: { orgId: { in: [ORG] }, role: { not: "WORKER" }, closedAt: null } });
    await searchPeople("Riley");
    expect(client.profile.findMany.mock.calls[2][0]).toMatchObject({ where: { OR: [{ displayName: { contains: "Riley", mode: "insensitive" } }, { worker: { displayName: { contains: "Riley", mode: "insensitive" } } }] } });
    expect(await searchPeople("@nobody")).toEqual({ kind: "handle", hits: [] });
    expect(client.profile.findMany).toHaveBeenCalledTimes(3);
  });

  it("removes a member with the owner's rules: the last owner stays, a worker isn't a member, the trail names Turfcut staff and the ledger names who and why", async () => {
    tx.profile.findUnique.mockResolvedValue({ id: P, role: "OWNER", orgId: ORG, closedAt: null });
    otherOwners.mockResolvedValue(0);
    await expect(staffRemoveMember(staff, P, "The owner asked", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/at least one owner/) });
    expect(lockOrg).toHaveBeenCalledWith(tx, ORG);
    expect(tx.profile.update).not.toHaveBeenCalled();
    tx.profile.findUnique.mockResolvedValue({ id: P, role: "SUPERVISOR", orgId: ORG, closedAt: null });
    await expect(staffRemoveMember(staff, P, "  Left in September; the owner asked us to close the seat  ", now)).resolves.toEqual({ ok: true });
    expect(tx.profile.update).toHaveBeenCalledWith({ where: { id: P }, data: { orgId: null } });
    expect(tx.auditEvent.create.mock.calls[0][0]).toMatchObject({ data: { actorId: null, action: "member.removed", entityType: "Profile", entityId: P, metadata: { orgId: ORG, role: "SUPERVISOR", by: "turfcut-staff" }, createdAt: now } });
    expect(tx.adminAction.create.mock.calls[0][0]).toMatchObject({ data: { staffId: staff.userId, action: "member.removed_for_org", targetType: "Profile", targetId: P, orgId: ORG, reason: "Left in September; the owner asked us to close the seat" } });
    tx.profile.findUnique.mockResolvedValue({ id: P, role: "WORKER", orgId: null, closedAt: null });
    await expect(staffRemoveMember(staff, P, "Trying", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/isn't a member/) });
    await expect(staffRemoveMember(staff, P, "  ", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/Say why/) });
  });

  it("a membership that changed between the first read and the lock is refused rather than acted on", async () => {
    tx.profile.findUnique.mockResolvedValueOnce({ orgId: ORG }).mockResolvedValueOnce({ id: P, role: "RECRUITER", orgId: "55555555-5555-5555-5555-555555555555", closedAt: null });
    await expect(staffRemoveMember(staff, P, "Trying", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/Reload/) });
    expect(tx.profile.update).not.toHaveBeenCalled();
  });

  it("resends a pending invite with the owner's rules: approved organization only, no email to an address that can't join, no revival on a failed send", async () => {
    const mail = vi.fn(async () => ({ ok: true as const }));
    tx.orgInvite.findUnique.mockResolvedValue({ orgId: ORG, email: "new@example.org", acceptedAt: null, revokedAt: null, org: { approved: true } });
    await expect(staffResendInvite(staff, INV, mail, "The owner asked us to nudge them", now)).resolves.toEqual({ ok: true });
    expect(mail).toHaveBeenCalledWith("new@example.org");
    expect(tx.orgInvite.updateMany).toHaveBeenCalledWith({ where: { id: INV, acceptedAt: null, revokedAt: null }, data: { expiresAt: new Date(now.getTime() + 7 * 86_400_000) } });
    expect(tx.auditEvent.create.mock.calls[0][0]).toMatchObject({ data: { actorId: null, action: "invite.resent", entityType: "OrgInvite", entityId: INV, metadata: { orgId: ORG, by: "turfcut-staff" } } });
    expect(tx.adminAction.create.mock.calls[0][0]).toMatchObject({ data: { action: "invite.resent_for_org", targetType: "OrgInvite", targetId: INV, orgId: ORG } });
    // An address that already has a worker login is never emailed and never told why; the invite still moves.
    mail.mockClear();
    tx.$queryRaw.mockResolvedValueOnce([{ id: P }]);
    tx.profile.findUnique.mockResolvedValueOnce({ role: "WORKER", orgId: null, closedAt: null });
    await expect(staffResendInvite(staff, INV, mail, "Nudge", now)).resolves.toEqual({ ok: true });
    expect(mail).not.toHaveBeenCalled();
    // A failed send changes nothing.
    tx.orgInvite.updateMany.mockClear();
    await expect(staffResendInvite(staff, INV, async () => ({ ok: false as const, message: "smtp down" }), "Nudge", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/didn't send/) });
    expect(tx.orgInvite.updateMany).not.toHaveBeenCalled();
    // Unapproved organization, or an invite no longer pending.
    tx.orgInvite.findUnique.mockResolvedValueOnce({ orgId: ORG, email: "x@example.org", acceptedAt: null, revokedAt: null, org: { approved: false } });
    await expect(staffResendInvite(staff, INV, mail, "Nudge", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/approved the organization/) });
    tx.orgInvite.findUnique.mockResolvedValueOnce({ orgId: ORG, email: "x@example.org", acceptedAt: now, revokedAt: null, org: { approved: true } });
    await expect(staffResendInvite(staff, INV, mail, "Nudge", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/no longer pending/) });
  });

  it("never reaches for what a worker controls: no preference, sharing, scorecard, metric or message access in the module", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/admin-people-data.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(src).not.toMatch(/\b(preferences?|politicalPreferences?|sharing\w*|profileMetrics|metrics|scorecards?|conversations?|messages|sentMessages|chatParticipations|politic\w*)\b/i);
  });
});
