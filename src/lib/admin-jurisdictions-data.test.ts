import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  jurisdictionProfile: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  job: { findMany: vi.fn(), update: vi.fn() },
  auditEvent: { create: vi.fn() },
  adminAction: { create: vi.fn<(args: { data: Record<string, unknown> }) => Promise<{ id: string }>>() },
  profile: { findMany: vi.fn() },
  notification: { createMany: vi.fn<(args: { data: Array<Record<string, unknown>> }) => Promise<{ count: number }>>() },
};
vi.mock("@/lib/db", () => ({ db: () => ({ $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) }) }));

const { approveJurisdictionVersion, proposeJurisdictionVersion, retireJurisdictionProposal, versionStanding, withdrawJurisdictionApproval } = await import("./admin-jurisdictions-data");
const { readRules } = await import("./jurisdiction-rules");

const staff = { userId: "11111111-1111-1111-1111-111111111111", staff: true as const };
const now = new Date("2026-10-20T17:00:00Z");
const V1 = "aaaaaaaa-0000-0000-0000-000000000001";
const V2 = "aaaaaaaa-0000-0000-0000-000000000002";
const profile = (over: Record<string, unknown> = {}) => ({
  id: V2, state: "CO", locality: "Denver", version: 2, isCurrent: false, approved: false, approvedAt: null, approvedById: null, createdById: staff.userId,
  effectiveFrom: null, approvalExpiresAt: null, supersededAt: null, createdAt: now, rules: { compensationAllowed: ["HOURLY", "SHIFT_RATE"], perUnitAllowed: false }, ...over,
});
const all = () => [tx.jurisdictionProfile.findUnique, tx.jurisdictionProfile.findFirst, tx.jurisdictionProfile.update, tx.jurisdictionProfile.create, tx.job.findMany, tx.job.update, tx.auditEvent.create, tx.adminAction.create, tx.profile.findMany, tx.notification.createMany];

describe("jurisdiction rule profiles (M10.3)", () => {
  beforeEach(() => {
    for (const m of all()) m.mockReset();
    tx.adminAction.create.mockResolvedValue({ id: "ledger-1" });
    tx.notification.createMany.mockResolvedValue({ count: 0 });
    tx.jurisdictionProfile.update.mockResolvedValue({});
    tx.jurisdictionProfile.create.mockResolvedValue({ id: V2 });
    tx.job.findMany.mockResolvedValue([]);
    tx.job.update.mockResolvedValue({});
    tx.auditEvent.create.mockResolvedValue({});
    tx.profile.findMany.mockResolvedValue([]);
  });

  it("reads a version's standing", () => {
    expect(versionStanding({ isCurrent: true, supersededAt: null })).toBe("current");
    expect(versionStanding({ isCurrent: false, supersededAt: null })).toBe("proposed");
    expect(versionStanding({ isCurrent: false, supersededAt: now })).toBe("superseded");
  });

  it("proposes the next version of a place, or version 1 of a new place, with the ledger row", async () => {
    tx.jurisdictionProfile.findFirst.mockResolvedValueOnce({ version: 2 });
    const rules = readRules({ compensationAllowed: ["HOURLY"] });
    await expect(proposeJurisdictionVersion(staff, { state: "co", locality: " Denver ", rules, effectiveFrom: null, reason: "Counsel's Oct 20 memo" }, now)).resolves.toEqual({ ok: true, id: V2, version: 3 });
    expect(tx.jurisdictionProfile.create.mock.calls[0][0]).toMatchObject({ data: { state: "CO", locality: "Denver", version: 3, isCurrent: false, approved: false, createdById: staff.userId, rules, createdAt: now } });
    expect(tx.adminAction.create.mock.calls[0][0]).toMatchObject({ data: { action: "jurisdiction.version_proposed", targetType: "JurisdictionProfile", targetId: V2, reason: "Counsel's Oct 20 memo", metadata: { state: "CO", locality: "Denver", version: 3 } } });
    tx.jurisdictionProfile.findFirst.mockResolvedValueOnce(null);
    await expect(proposeJurisdictionVersion(staff, { state: "NM", locality: "", rules, effectiveFrom: null, reason: "New state for the pilot" }, now)).resolves.toMatchObject({ ok: true, version: 1 });
    expect(tx.jurisdictionProfile.create.mock.calls[1][0]).toMatchObject({ data: { state: "NM", locality: null, version: 1 } });
  });

  it("refuses a bad place, bad rules, a bad date or no reason before touching the database", async () => {
    const rules = readRules({ compensationAllowed: ["HOURLY"] });
    await expect(proposeJurisdictionVersion(staff, { state: "Colorado", locality: "", rules, effectiveFrom: null, reason: "ok then" }, now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/two letters/) });
    await expect(proposeJurisdictionVersion(staff, { state: "CO", locality: "", rules: { ...rules, compensationAllowed: [] }, effectiveFrom: null, reason: "ok then" }, now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/at least one pay method/) });
    await expect(proposeJurisdictionVersion(staff, { state: "CO", locality: "", rules, effectiveFrom: new Date("nope"), reason: "ok then" }, now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/effective date/) });
    await expect(proposeJurisdictionVersion(staff, { state: "CO", locality: "", rules, effectiveFrom: null, reason: " " }, now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/Say why/) });
    expect(tx.jurisdictionProfile.create).not.toHaveBeenCalled();
  });

  it("approving a proposed version makes it current, supersedes the old one, moves the jobs that fit and freezes the rest, telling their organizations", async () => {
    tx.jurisdictionProfile.findUnique.mockResolvedValue(profile());
    tx.jurisdictionProfile.findFirst.mockResolvedValue({ id: V1, version: 1 });
    tx.job.findMany.mockResolvedValue([
      { id: "job-hourly", orgId: "org-a", compensationMethod: "HOURLY" },
      { id: "job-unit", orgId: "org-b", compensationMethod: "PER_UNIT" },
      { id: "job-shift", orgId: "org-b", compensationMethod: "SHIFT_RATE" },
    ]);
    tx.profile.findMany.mockResolvedValue([{ id: "owner-b" }, { id: "recruiter-b" }]);
    const expires = new Date("2027-10-20T00:00:00Z");
    await expect(approveJurisdictionVersion(staff, V2, { approvalExpiresAt: expires, reason: "Counsel signed off on the Oct 20 call" }, now)).resolves.toEqual({ ok: true, moved: 2, frozen: 1 });
    expect(tx.jurisdictionProfile.update).toHaveBeenNthCalledWith(1, { where: { id: V2 }, data: { approved: true, approvedAt: now, approvedById: staff.userId, approvalExpiresAt: expires, isCurrent: true } });
    expect(tx.jurisdictionProfile.update).toHaveBeenNthCalledWith(2, { where: { id: V1 }, data: { isCurrent: false, supersededAt: now } });
    expect(tx.job.update.mock.calls.map((c) => c[0])).toEqual([{ where: { id: "job-hourly" }, data: { jurisdictionId: V2 } }, { where: { id: "job-shift" }, data: { jurisdictionId: V2 } }]);
    expect(tx.auditEvent.create.mock.calls.map((c) => c[0].data)).toMatchObject([{ actorId: null, action: "job.jurisdiction_moved", entityType: "Job", entityId: "job-hourly", metadata: { from: V1, to: V2, fromVersion: 1, toVersion: 2 } }, { entityId: "job-shift" }]);
    expect(tx.adminAction.create.mock.calls[0][0]).toMatchObject({ data: { action: "jurisdiction.version_approved", targetId: V2, metadata: { version: 2, supersededId: V1, moved: 2, frozen: 1, approvalExpiresAt: expires.toISOString() } } });
    expect(tx.profile.findMany).toHaveBeenCalledWith({ where: { orgId: { in: ["org-b"] }, role: { in: ["OWNER", "RECRUITER"] }, closedAt: null }, select: { id: true } });
    expect(tx.notification.createMany).toHaveBeenCalledWith({ data: [{ recipientId: "owner-b", kind: "ORG_JOBS_FROZEN", createdAt: now }, { recipientId: "recruiter-b", kind: "ORG_JOBS_FROZEN", createdAt: now }] });
  });

  it("a brand-new place's first version just becomes current; a current version whose approval lapsed is renewed in place", async () => {
    tx.jurisdictionProfile.findUnique.mockResolvedValueOnce(profile({ version: 1 }));
    tx.jurisdictionProfile.findFirst.mockResolvedValueOnce(null);
    await expect(approveJurisdictionVersion(staff, V2, { approvalExpiresAt: null, reason: "First rules for the place" }, now)).resolves.toEqual({ ok: true, moved: 0, frozen: 0 });
    expect(tx.job.findMany).not.toHaveBeenCalled();
    expect(tx.notification.createMany).not.toHaveBeenCalled();
    tx.jurisdictionProfile.findUnique.mockResolvedValueOnce(profile({ isCurrent: true, approved: true, approvalExpiresAt: new Date("2026-10-01T00:00:00Z") }));
    await expect(approveJurisdictionVersion(staff, V2, { approvalExpiresAt: null, reason: "Counsel renewed it" }, now)).resolves.toEqual({ ok: true, moved: 0, frozen: 0 });
    expect(tx.jurisdictionProfile.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.adminAction.create.mock.calls[1][0]).toMatchObject({ data: { action: "jurisdiction.approval_renewed" } });
  });

  it("refuses an expiry in the past, a superseded version, and a missing one", async () => {
    await expect(approveJurisdictionVersion(staff, V2, { approvalExpiresAt: new Date("2026-01-01T00:00:00Z"), reason: "ok then" }, now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/in the future/) });
    tx.jurisdictionProfile.findUnique.mockResolvedValueOnce(profile({ supersededAt: now }));
    await expect(approveJurisdictionVersion(staff, V2, { approvalExpiresAt: null, reason: "ok then" }, now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/superseded/) });
    tx.jurisdictionProfile.findUnique.mockResolvedValueOnce(null);
    await expect(approveJurisdictionVersion(staff, V2, { approvalExpiresAt: null, reason: "ok then" }, now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/no longer exists/) });
    expect(tx.jurisdictionProfile.update).not.toHaveBeenCalled();
    expect(tx.adminAction.create).not.toHaveBeenCalled();
  });

  it("withdrawing approval freezes everything under the version and tells the organizations with open jobs", async () => {
    tx.jurisdictionProfile.findUnique.mockResolvedValueOnce({ approved: true, version: 1 });
    tx.job.findMany.mockResolvedValueOnce([{ orgId: "org-a" }, { orgId: "org-a" }, { orgId: "org-b" }]);
    tx.profile.findMany.mockResolvedValueOnce([{ id: "owner-a" }, { id: "owner-b" }]);
    await expect(withdrawJurisdictionApproval(staff, V1, "Counsel pulled the opinion", now)).resolves.toEqual({ ok: true, frozen: 3 });
    expect(tx.jurisdictionProfile.update).toHaveBeenCalledWith({ where: { id: V1 }, data: { approved: false } });
    expect(tx.profile.findMany.mock.calls[0][0]).toMatchObject({ where: { orgId: { in: ["org-a", "org-b"] } } });
    expect(tx.notification.createMany.mock.calls[0][0].data).toHaveLength(2);
    tx.jurisdictionProfile.findUnique.mockResolvedValueOnce({ approved: false, version: 2 });
    await expect(withdrawJurisdictionApproval(staff, V2, "Again", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/nothing to withdraw/) });
  });

  it("only a proposed version can be retired", async () => {
    tx.jurisdictionProfile.findUnique.mockResolvedValueOnce({ isCurrent: false, supersededAt: null, version: 2 });
    await expect(retireJurisdictionProposal(staff, V2, "Counsel changed the draft", now)).resolves.toEqual({ ok: true });
    expect(tx.jurisdictionProfile.update).toHaveBeenCalledWith({ where: { id: V2 }, data: { supersededAt: now } });
    expect(tx.adminAction.create.mock.calls[0][0]).toMatchObject({ data: { action: "jurisdiction.proposal_retired" } });
    tx.jurisdictionProfile.findUnique.mockResolvedValueOnce({ isCurrent: true, supersededAt: null, version: 1 });
    await expect(retireJurisdictionProposal(staff, V1, "Oops", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/Only a proposed/) });
  });
});
