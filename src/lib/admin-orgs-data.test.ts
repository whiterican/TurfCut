import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  organization: { findUnique: vi.fn(), updateMany: vi.fn() },
  adminAction: { create: vi.fn<(args: { data: Record<string, unknown> }) => Promise<{ id: string }>>() },
  profile: { findMany: vi.fn() },
  notification: { createMany: vi.fn<(args: { data: Array<Record<string, unknown>> }) => Promise<{ count: number }>>() },
};
const client = {
  organization: { findUnique: vi.fn(), findMany: vi.fn() },
  profile: { groupBy: vi.fn(), findMany: vi.fn() },
  job: { groupBy: vi.fn() },
  adminAction: { findMany: vi.fn() },
  $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
};
const emailsFor = vi.fn<(ids: string[]) => Promise<Map<string, string>>>();
vi.mock("@/lib/db", () => ({ db: () => client }));
const clearOrgVerifications = vi.fn<(t: unknown, orgId: string) => Promise<number>>(async () => 0);
vi.mock("@/lib/members-data", () => ({ emailsFor: (ids: string[]) => emailsFor(ids) }));
vi.mock("@/lib/campaign-admin-data", () => ({ clearOrgVerifications: (t: unknown, orgId: string) => clearOrgVerifications(t, orgId) }));

const { approvalStanding, decideOrganization, decisionProblem, isDecision, listOrganizationsForAdmin, loadOrganizationForAdmin } = await import("./admin-orgs-data");

const staff = { userId: "11111111-1111-1111-1111-111111111111", staff: true as const };
const ORG = "22222222-2222-2222-2222-222222222222";
const now = new Date("2026-10-20T16:00:00Z");
const record = (over: Partial<{ id: string; approved: boolean; approvedAt: Date | null; createdAt: Date; legalContact: string | null }> = {}) => ({
  id: ORG, name: "Boulder Canvass Co", createdAt: new Date("2026-10-01T00:00:00Z"), approved: false, approvedAt: null,
  contractorTermsSignedAt: null, classificationReviewedAt: now, legalContact: " ", ...over,
});

describe("the organization approval queue (M10.2)", () => {
  beforeEach(() => {
    for (const m of [tx.organization.findUnique, tx.organization.updateMany, tx.adminAction.create, tx.profile.findMany, tx.notification.createMany, client.organization.findUnique, client.organization.findMany, client.profile.groupBy, client.profile.findMany, client.job.groupBy, client.adminAction.findMany, emailsFor]) m.mockReset();
    tx.adminAction.create.mockResolvedValue({ id: "ledger-1" });
    tx.notification.createMany.mockResolvedValue({ count: 0 });
    tx.organization.updateMany.mockResolvedValue({ count: 1 });
    tx.profile.findMany.mockResolvedValue([{ id: "owner-1" }, { id: "owner-2" }]);
    client.profile.groupBy.mockResolvedValue([]);
    client.profile.findMany.mockResolvedValue([]);
    client.job.groupBy.mockResolvedValue([]);
    client.adminAction.findMany.mockResolvedValue([]);
    emailsFor.mockResolvedValue(new Map());
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

  it("approving or withdrawing takes the organization's campaign marks off in the same transaction, and the ledger row counts them", async () => {
    tx.organization.findUnique.mockResolvedValue({ approved: true });
    clearOrgVerifications.mockResolvedValueOnce(2);
    await decideOrganization(staff, ORG, "revoke", "Terms lapsed", now);
    expect(clearOrgVerifications).toHaveBeenCalledWith(tx, ORG);
    expect(tx.adminAction.create.mock.calls.at(-1)?.[0]).toMatchObject({ data: { action: "org.approval_revoked", metadata: { campaignMarksCleared: 2 } } });
    // Restoring approval clears any mark a concurrent verification slipped in under the withdrawal.
    clearOrgVerifications.mockClear();
    clearOrgVerifications.mockResolvedValueOnce(1);
    tx.organization.findUnique.mockResolvedValue({ approved: false });
    await decideOrganization(staff, ORG, "approve", "Signed", now);
    expect(clearOrgVerifications).toHaveBeenCalledWith(tx, ORG);
    expect(tx.adminAction.create.mock.calls.at(-1)?.[0]).toMatchObject({ data: { action: "org.approved", metadata: { campaignMarksCleared: 1 } } });
  });

  it("refuses a blank or oversized reason, a decision that changes nothing, and a missing organization before anything is written", async () => {
    await expect(decideOrganization(staff, ORG, "approve", "   ", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/Say why/) });
    await expect(decideOrganization(staff, ORG, "approve", "x".repeat(501), now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/500 characters or fewer/) });
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

  it("an unknown organization reads as null, and an empty queue issues no member or job queries", async () => {
    client.organization.findUnique.mockResolvedValue(null);
    await expect(loadOrganizationForAdmin(ORG)).resolves.toBeNull();
    client.organization.findMany.mockResolvedValue([]);
    await expect(listOrganizationsForAdmin()).resolves.toEqual({ awaiting: [], approved: [] });
    expect(client.profile.groupBy).not.toHaveBeenCalled();
    expect(client.job.groupBy).not.toHaveBeenCalled();
    expect(emailsFor).not.toHaveBeenCalled();
  });

  it("a row carries the gate (a blank legal contact is not one), owners with their sign-in email or none, and jobs by status; the awaiting list waits longest first, counting from a withdrawal", async () => {
    const withdrawn = record({ id: "33333333-3333-3333-3333-333333333333", approvedAt: new Date("2026-10-15T00:00:00Z"), createdAt: new Date("2026-09-01T00:00:00Z") });
    client.organization.findMany.mockImplementation(async (args: { where: { approved: boolean } }) => (args.where.approved ? [] : [withdrawn, record()]));
    client.profile.groupBy.mockResolvedValue([{ orgId: ORG, _count: { _all: 3 } }]);
    client.profile.findMany.mockResolvedValue([{ id: "owner-1", orgId: ORG, displayName: "Riley Park", createdAt: now }, { id: "owner-2", orgId: ORG, displayName: null, createdAt: now }]);
    client.job.groupBy.mockResolvedValue([{ orgId: ORG, status: "DRAFT", _count: { _all: 2 } }, { orgId: ORG, status: "PUBLISHED", _count: { _all: 1 } }, { orgId: ORG, status: "CLOSED", _count: { _all: 4 } }]);
    emailsFor.mockResolvedValue(new Map([["owner-1", "riley@boulder.test"]]));
    const { awaiting } = await listOrganizationsForAdmin();
    expect(awaiting.map((o) => o.id)).toEqual([ORG, withdrawn.id]);
    expect(awaiting[0]).toMatchObject({
      members: 3,
      gate: { contractorTerms: false, classificationReview: true, legalContact: false },
      owners: [{ profileId: "owner-1", name: "Riley Park", email: "riley@boulder.test" }, { profileId: "owner-2", name: null, email: null }],
      jobs: { draft: 2, published: 1, other: 4 },
    });
    expect(awaiting[1]).toMatchObject({ members: 0, owners: [], jobs: { draft: 0, published: 0, other: 0 } });
  });
});
