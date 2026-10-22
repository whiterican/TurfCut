import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { checkReason, recordAdminAction, staffLabel, type StaffActor } from "@/lib/admin-data";
import { emailsFor } from "@/lib/members-data";

/**
 * The staff console's view of campaign profiles (M10.4 lookup by handle,
 * M10.5 verification). It reads names, handles and standing; it ranks
 * nothing, and verification is a mark on a page, never an input to the job
 * feed, matching or any order a worker sees.
 */

/** The record type staff acts on a campaign profile are filed under. */
export const CAMPAIGN_TARGET = "CampaignProfile" as const;
export type CampaignTarget = typeof CAMPAIGN_TARGET;

/** Where a campaign profile's console page is, for the audit viewer's links. */
export function campaignRecordHref(entityType: string, entityId: string): string | null {
  return entityType === CAMPAIGN_TARGET ? `/admin/campaigns/${entityId}` : null;
}

/**
 * The organizations behind campaign profiles whose handle starts with `q`
 * (M10.4, the console's people lookup). Reads the handle only.
 */
export async function orgIdsByCampaignHandle(q: string, limit = 10): Promise<string[]> {
  const handle = q.replace(/^@/, "").trim().toLowerCase();
  if (!handle) return [];
  const rows = await db().campaignProfile.findMany({ where: { handle: { startsWith: handle } }, select: { orgId: true }, take: limit });
  return [...new Set(rows.map((r) => r.orgId))];
}

// ---------------------------------------------------------------------------
// The verification queue (M10.5)
// ---------------------------------------------------------------------------

export interface AdminCampaignRow {
  id: string;
  handle: string;
  displayName: string;
  orgId: string;
  orgName: string;
  orgApproved: boolean;
  createdAt: Date;
  publishedAt: Date | null;
  verifiedAt: Date | null;
  /** The staff member who verified it, named as the console names staff. */
  verifiedBy: string | null;
}

export interface AdminCampaignHistoryRow {
  id: string;
  action: string;
  reason: string;
  staffName: string;
  createdAt: Date;
}

export interface AdminCampaignDetail extends AdminCampaignRow {
  /** The bio as the public sees it; withheld (null) while the profile is a draft. */
  bio: string | null;
  posts: number;
  lastPostAt: Date | null;
  owners: { profileId: string; name: string | null; email: string | null }[];
  history: AdminCampaignHistoryRow[];
}

const STAFF_SELECT = { id: true, displayName: true, worker: { select: { displayName: true } } } as const;
const ROW_SELECT = {
  id: true, handle: true, displayName: true, orgId: true, createdAt: true, publishedAt: true, verifiedAt: true,
  org: { select: { name: true, approved: true } },
  verifiedBy: { select: STAFF_SELECT },
} satisfies Prisma.CampaignProfileSelect;
type RowRecord = Prisma.CampaignProfileGetPayload<{ select: typeof ROW_SELECT }>;
const toRow = (c: RowRecord): AdminCampaignRow => ({
  id: c.id, handle: c.handle, displayName: c.displayName, orgId: c.orgId, orgName: c.org.name, orgApproved: c.org.approved,
  createdAt: c.createdAt, publishedAt: c.publishedAt, verifiedAt: c.verifiedAt, verifiedBy: c.verifiedBy ? staffLabel(c.verifiedBy) : null,
});

/** A profile is public (and so can be verified) while it is published and its organization approved. */
export const isPublic = (c: { publishedAt: Date | null; orgApproved: boolean }) => !!c.publishedAt && c.orgApproved;

const LIST_MAX = 200;

/**
 * The queue (M10.5): public profiles not yet verified, longest-waiting
 * first; then the verified ones, latest first. A verified profile whose
 * organization has since been withdrawn or unpublished is still listed, so
 * staff can see what the mark is attached to.
 */
export async function listCampaignsForVerification(): Promise<{ awaiting: AdminCampaignRow[]; verified: AdminCampaignRow[] }> {
  const [awaiting, verified] = await Promise.all([
    db().campaignProfile.findMany({ where: { verifiedAt: null, publishedAt: { not: null }, org: { approved: true } }, select: ROW_SELECT, orderBy: [{ publishedAt: "asc" }, { id: "asc" }], take: LIST_MAX }),
    db().campaignProfile.findMany({ where: { verifiedAt: { not: null } }, select: ROW_SELECT, orderBy: [{ verifiedAt: "desc" }, { id: "asc" }], take: LIST_MAX }),
  ]);
  return { awaiting: awaiting.map(toRow), verified: verified.map(toRow) };
}

/** How many public profiles wait for a decision, for the console's overview. */
export const countAwaitingVerification = () => db().campaignProfile.count({ where: { verifiedAt: null, publishedAt: { not: null }, org: { approved: true } } });

/** One profile for the detail page, with Turfcut's decisions on it, newest first. */
export async function loadCampaignForVerification(id: string): Promise<AdminCampaignDetail | null> {
  const c = await db().campaignProfile.findUnique({ where: { id }, select: { ...ROW_SELECT, bio: true } });
  if (!c) return null;
  const row = toRow(c);
  const [posts, last, owners, history] = await Promise.all([
    db().campaignPost.count({ where: { profileId: id, deletedAt: null } }),
    db().campaignPost.aggregate({ where: { profileId: id, deletedAt: null }, _max: { createdAt: true } }),
    db().profile.findMany({ where: { orgId: c.orgId, role: "OWNER", closedAt: null }, select: { id: true, displayName: true }, orderBy: { createdAt: "asc" } }),
    db().adminAction.findMany({ where: { targetType: CAMPAIGN_TARGET, targetId: id }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 20, select: { id: true, action: true, reason: true, createdAt: true, staff: { select: STAFF_SELECT } } }),
  ]);
  const emails = await emailsFor(owners.map((o) => o.id));
  return {
    ...row,
    bio: isPublic(row) ? c.bio : null,
    posts,
    lastPostAt: last._max.createdAt,
    owners: owners.map((o) => ({ profileId: o.id, name: o.displayName, email: emails.get(o.id) ?? null })),
    history: history.map((h) => ({ id: h.id, action: h.action, reason: h.reason, staffName: staffLabel(h.staff), createdAt: h.createdAt })),
  };
}

type Outcome = { ok: true } | { ok: false; message: string };

/** What the staff member saw when they decided: a rename or a new handle in between voids the decision. */
export interface SeenIdentity {
  handle: string;
  displayName: string;
}

/**
 * Verify a profile as its organization's official campaign account (M10.5).
 * The update is one conditional statement: it applies only while the profile
 * is still unverified, still public, and still has the name and handle the
 * staff member looked at, so an organization renaming itself between look
 * and click, or two staff deciding at once, can't produce a mark nobody
 * checked. The reason goes on the ledger.
 */
export async function verifyCampaign(staff: StaffActor, id: string, seen: SeenIdentity, reason: unknown, now = new Date()): Promise<Outcome> {
  const r = checkReason(reason);
  if (!r.ok) return r;
  return db().$transaction(async (tx) => {
    const changed = await tx.campaignProfile.updateMany({
      where: { id, verifiedAt: null, publishedAt: { not: null }, org: { approved: true }, handle: seen.handle, displayName: seen.displayName },
      data: { verifiedAt: now, verifiedById: staff.userId },
    });
    if (changed.count !== 1) {
      const c = await tx.campaignProfile.findUnique({ where: { id }, select: { handle: true, displayName: true, publishedAt: true, verifiedAt: true, org: { select: { approved: true } } } });
      if (!c) return { ok: false as const, message: "That campaign no longer exists." };
      if (c.verifiedAt) return { ok: false as const, message: "This profile is already verified." };
      if (!c.publishedAt || !c.org.approved) return { ok: false as const, message: "Only a public profile can be verified: it has to be published, and its organization approved." };
      return { ok: false as const, message: "The name or handle changed since you opened this page. Reload and check it again." };
    }
    const c = await tx.campaignProfile.findUniqueOrThrow({ where: { id }, select: { orgId: true } });
    await recordAdminAction(tx, { staff, action: "campaign.verified", targetType: CAMPAIGN_TARGET, targetId: id, orgId: c.orgId, reason: r.reason, metadata: { handle: seen.handle, displayName: seen.displayName } }, now);
    return { ok: true as const };
  });
}

/** Take the mark off (M10.5), whatever the profile's standing; the reason goes on the ledger. */
export async function unverifyCampaign(staff: StaffActor, id: string, reason: unknown, now = new Date()): Promise<Outcome> {
  const r = checkReason(reason);
  if (!r.ok) return r;
  return db().$transaction(async (tx) => {
    const c = await tx.campaignProfile.findUnique({ where: { id }, select: { orgId: true, handle: true, verifiedAt: true } });
    if (!c) return { ok: false as const, message: "That campaign no longer exists." };
    const changed = await tx.campaignProfile.updateMany({ where: { id, verifiedAt: { not: null } }, data: { verifiedAt: null, verifiedById: null } });
    if (changed.count !== 1) return { ok: false as const, message: "This profile isn't verified, so there is nothing to remove." };
    await recordAdminAction(tx, { staff, action: "campaign.unverified", targetType: CAMPAIGN_TARGET, targetId: id, orgId: c.orgId, reason: r.reason, metadata: { handle: c.handle, verifiedAt: c.verifiedAt?.toISOString() ?? null } }, now);
    return { ok: true as const };
  });
}
