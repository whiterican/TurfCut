import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  organization: { findUnique: vi.fn(), updateMany: vi.fn() },
  adminAction: { create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({ id: "ledger-1" })) },
  profile: { findMany: vi.fn() },
  notification: { createMany: vi.fn(async (_args: { data: Array<Record<string, unknown>> }) => ({ count: 0 })) },
};
vi.mock("@/lib/db", () => ({ db: () => ({ $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) }) }));
vi.mock("@/lib/members-data", () => ({ emailsFor: vi.fn(async () => new Map()) }));

const { approvalStanding, decideOrganization, decisionProblem, isDecision } = await import("./admin-orgs-data");

const staff = { userId: "11111111-1111-1111-1111-111111111111", staff: true as const };
const ORG = "22222222-2222-2222-2222-222222222222";
const now = new Date("2026-10-20T16:00:00Z");

describe("the organization approval queue (M10.2)", () => {
  beforeEach(() => {
    for (const m of [tx.organization.findUnique, tx.organization.updateMany, tx.adminAction.create, tx.profile.findMany, tx.notification.createMany]) m.mockClear();
    tx.organization.updateMany.mockResolvedValue({ count: 1 });
    tx.profile.findMany.mockResolvedValue([{ id: "owner-1" }, { id: "owner-2" }]);
  });

  it("reads an organization's standing: never approved, approved, or approval withdrawn", () => {
    expect(approvalStanding({ approved: true, approvedAt: now })).toBe("approved");
    expect(approvalStanding({ approved: true, approvedAt: null })).toBe("approved");
    expect(approvalStanding({ approved: false, approvedAt: null })).toBe("awaiting");
    expect(approvalStanding({ approved: false, approvedAt: now })).toBe("withdrawn");
  });

  it("names a decision that would change nothing", () => {
    expect(decisionProblem({ approved: true }, "approve")).toMatch(/already approved/);
    expect(decisionProblem({ approved: false }, "revoke")).toMatch(/nothing to withdraw/);
    expect(decisionProblem({ approved: false }, "approve")).toBeNull();
    expect(decisionProblem({ approved: true }, "revoke")).toBeNull();
    expect(isDecision("approve") && isDecision("revoke") && !isDecision("delete") && !isDecision(null)).toBe(true);
  });

  it("approving stamps the date, records the ledger row with the trimmed reason, and tells every current owner, in one transaction", async () => {
    tx.organization.findUnique.mockResolvedValue({ approved: false });
    await expect(decideOrganization(staff, ORG, "approve", "  Pilot partner, terms on the call  ", now)).resolves.toEqual({ ok: true });
    expect(tx.organization.updateMany).toHaveBeenCalledWith({ where: { id: ORG, approved: false }, data: { approved: true, approvedAt: now } });
    expect(tx.adminAction.create.mock.calls[0][0]).toMatchObject({ data: { staffId: staff.userId, action: "org.approved", targetType: "Organization", targetId: ORG, orgId: ORG, reason: "Pilot partner, terms on the call", createdAt: now } });
    expect(tx.profile.findMany).toHaveBeenCalledWith({ where: { orgId: ORG, role: "OWNER", closedAt: null }, select: { id: true } });
    expect(tx.notification.createMany).toHaveBeenCalledWith({ data: [{ recipientId: "owner-1", kind: "ORG_APPROVED", createdAt: now }, { recipientId: "owner-2", kind: "ORG_APPROVED", createdAt: now }] });
  });

  it("withdrawing keeps the date of the last approval and sends the other notice", async () => {
    tx.organization.findUnique.mockResolvedValue({ approved: true });
    await expect(decideOrganization(staff, ORG, "revoke", "Terms lapsed", now)).resolves.toEqual({ ok: true });
    expect(tx.organization.updateMany).toHaveBeenCalledWith({ where: { id: ORG, approved: true }, data: { approved: false } });
    expect(tx.adminAction.create.mock.calls[0][0]).toMatchObject({ data: { action: "org.approval_revoked" } });
    expect(tx.notification.createMany.mock.calls[0][0]).toMatchObject({ data: [{ kind: "ORG_APPROVAL_REVOKED" }, { kind: "ORG_APPROVAL_REVOKED" }] });
  });

  it("refuses a blank reason, a decision that changes nothing, and a missing organization before anything is written", async () => {
    await expect(decideOrganization(staff, ORG, "approve", "   ", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/Say why/) });
    tx.organization.findUnique.mockResolvedValueOnce({ approved: true });
    await expect(decideOrganization(staff, ORG, "approve", "Looks good", now)).resolves.toEqual({ ok: false, message: "This organization is already approved." });
    tx.organization.findUnique.mockResolvedValueOnce(null);
    await expect(decideOrganization(staff, ORG, "approve", "Looks good", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/no longer exists/) });
    expect(tx.organization.updateMany).not.toHaveBeenCalled();
    expect(tx.adminAction.create).not.toHaveBeenCalled();
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });

  it("a second staff member deciding the same thing at the same moment records nothing twice", async () => {
    tx.organization.findUnique.mockResolvedValue({ approved: false });
    tx.organization.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(decideOrganization(staff, ORG, "approve", "Looks good", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/Someone else/) });
    expect(tx.adminAction.create).not.toHaveBeenCalled();
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });

  it("sends no notice when the organization has no owner left", async () => {
    tx.organization.findUnique.mockResolvedValue({ approved: false });
    tx.profile.findMany.mockResolvedValueOnce([]);
    await expect(decideOrganization(staff, ORG, "approve", "Looks good", now)).resolves.toEqual({ ok: true });
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });
});
