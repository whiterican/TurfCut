import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  campaignProfile: { updateMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  adminAction: { create: vi.fn<(args: { data: Record<string, unknown> }) => Promise<{ id: string }>>() },
};
const client = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
vi.mock("@/lib/db", () => ({ db: () => client }));
vi.mock("@/lib/members-data", () => ({ emailsFor: async () => new Map() }));

const { campaignRecordHref, CAMPAIGN_TARGET, isPublic, unverifyCampaign, verifyCampaign } = await import("./campaign-admin-data");

const staff = { userId: "11111111-1111-1111-1111-111111111111", staff: true as const };
const ID = "22222222-2222-2222-2222-222222222222";
const ORG = "33333333-3333-3333-3333-333333333333";
const seen = { handle: "frontrange", displayName: "Front Range Circulators" };
const now = new Date("2026-10-22T15:00:00Z");

describe("campaign verification (M10.5)", () => {
  beforeEach(() => {
    for (const m of [tx.campaignProfile.updateMany, tx.campaignProfile.findUnique, tx.campaignProfile.findUniqueOrThrow, tx.adminAction.create]) m.mockReset();
    tx.adminAction.create.mockResolvedValue({ id: "ledger-1" });
    tx.campaignProfile.findUniqueOrThrow.mockResolvedValue({ orgId: ORG });
  });

  it("files staff acts under the campaign record type and links it to its console page", () => {
    expect(CAMPAIGN_TARGET).toBe("CampaignProfile");
    expect(campaignRecordHref("CampaignProfile", ID)).toBe(`/admin/campaigns/${ID}`);
    expect(campaignRecordHref("Job", ID)).toBeNull();
    expect(isPublic({ publishedAt: now, orgApproved: true })).toBe(true);
    expect(isPublic({ publishedAt: null, orgApproved: true })).toBe(false);
    expect(isPublic({ publishedAt: now, orgApproved: false })).toBe(false);
  });

  it("verifies in one conditional update: unverified, public, and still the name and handle the staff member saw; the ledger row carries the reason", async () => {
    tx.campaignProfile.updateMany.mockResolvedValue({ count: 1 });
    await expect(verifyCampaign(staff, ID, seen, "  Called the owner; handle matches their site  ", now)).resolves.toEqual({ ok: true });
    expect(tx.campaignProfile.updateMany).toHaveBeenCalledWith({
      where: { id: ID, verifiedAt: null, publishedAt: { not: null }, org: { approved: true }, handle: "frontrange", displayName: "Front Range Circulators" },
      data: { verifiedAt: now, verifiedById: staff.userId },
    });
    expect(tx.adminAction.create.mock.calls[0][0]).toMatchObject({ data: { staffId: staff.userId, action: "campaign.verified", targetType: "CampaignProfile", targetId: ID, orgId: ORG, reason: "Called the owner; handle matches their site" } });
  });

  it("says why a verification changed nothing: gone, already verified, not public, or renamed since the staff member looked", async () => {
    tx.campaignProfile.updateMany.mockResolvedValue({ count: 0 });
    tx.campaignProfile.findUnique.mockResolvedValueOnce(null);
    await expect(verifyCampaign(staff, ID, seen, "Trying", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/no longer exists/) });
    tx.campaignProfile.findUnique.mockResolvedValueOnce({ ...seen, publishedAt: now, verifiedAt: now, org: { approved: true } });
    await expect(verifyCampaign(staff, ID, seen, "Trying", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/already verified/) });
    tx.campaignProfile.findUnique.mockResolvedValueOnce({ ...seen, publishedAt: null, verifiedAt: null, org: { approved: true } });
    await expect(verifyCampaign(staff, ID, seen, "Trying", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/public profile/) });
    tx.campaignProfile.findUnique.mockResolvedValueOnce({ ...seen, publishedAt: now, verifiedAt: null, org: { approved: false } });
    await expect(verifyCampaign(staff, ID, seen, "Trying", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/public profile/) });
    tx.campaignProfile.findUnique.mockResolvedValueOnce({ handle: "frontrange", displayName: "Front Range PAC", publishedAt: now, verifiedAt: null, org: { approved: true } });
    await expect(verifyCampaign(staff, ID, seen, "Trying", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/changed since you opened/) });
    expect(tx.adminAction.create).not.toHaveBeenCalled();
  });

  it("refuses a verification or removal without a reason before touching anything", async () => {
    await expect(verifyCampaign(staff, ID, seen, "  ", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/Say why/) });
    await expect(unverifyCampaign(staff, ID, "", now)).resolves.toMatchObject({ ok: false });
    expect(tx.campaignProfile.updateMany).not.toHaveBeenCalled();
  });

  it("removes the mark whatever the profile's standing, once, and records what it was", async () => {
    tx.campaignProfile.findUnique.mockResolvedValue({ orgId: ORG, handle: "frontrange", verifiedAt: now });
    tx.campaignProfile.updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(unverifyCampaign(staff, ID, "They changed hands", now)).resolves.toEqual({ ok: true });
    expect(tx.campaignProfile.updateMany).toHaveBeenCalledWith({ where: { id: ID, verifiedAt: { not: null } }, data: { verifiedAt: null, verifiedById: null } });
    expect(tx.adminAction.create.mock.calls[0][0]).toMatchObject({ data: { action: "campaign.unverified", targetId: ID, orgId: ORG, metadata: { handle: "frontrange", verifiedAt: now.toISOString() } } });
    tx.campaignProfile.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(unverifyCampaign(staff, ID, "Again", now)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/isn't verified/) });
    expect(tx.adminAction.create).toHaveBeenCalledTimes(1);
  });
});
