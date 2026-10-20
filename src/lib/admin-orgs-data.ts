import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { checkReason, recordAdminAction, staffLabel, type StaffActor } from "@/lib/admin-data";
import { emailsFor } from "@/lib/members-data";

/** The publish gate as the queue shows it: the three things an organization records itself (spec p.15). */
export interface OrgGate {
  contractorTerms: boolean;
  classificationReview: boolean;
  legalContact: boolean;
}

export interface AdminOrgOwner {
  profileId: string;
  name: string | null;
  email: string | null;
  since: Date;
}

export interface AdminOrgRow {
  id: string;
  name: string;
  createdAt: Date;
  approved: boolean;
  /** When Turfcut last approved it; set while approval stands and after it is withdrawn, null if never approved. */
  approvedAt: Date | null;
  members: number;
  owners: AdminOrgOwner[];
  gate: OrgGate;
  jobs: { draft: number; published: number; other: number };
}

export interface AdminOrgHistoryRow {
  id: string;
  action: string;
  reason: string;
  staffName: string;
  createdAt: Date;
}

/** An organization's standing in words: never approved, approved, or approval withdrawn. */
export type ApprovalStanding = "awaiting" | "approved" | "withdrawn";
export function approvalStanding(org: { approved: boolean; approvedAt: Date | null }): ApprovalStanding {
  if (org.approved) return "approved";
  return org.approvedAt ? "withdrawn" : "awaiting";
}

const ORG_SELECT = {
  id: true, name: true, createdAt: true, approved: true, approvedAt: true,
  contractorTermsSignedAt: true, classificationReviewedAt: true, legalContact: true,
} satisfies Prisma.OrganizationSelect;
type OrgRecord = Prisma.OrganizationGetPayload<{ select: typeof ORG_SELECT }>;

/** Rows for a set of organizations, with members, owners and job counts gathered in four queries, not four per organization. */
async function rowsFor(orgs: OrgRecord[]): Promise<AdminOrgRow[]> {
  if (!orgs.length) return [];
  const ids = orgs.map((o) => o.id);
  const [members, owners, jobs] = await Promise.all([
    db().profile.groupBy({ by: ["orgId"], where: { orgId: { in: ids }, role: { not: "WORKER" }, closedAt: null }, _count: { _all: true } }),
    db().profile.findMany({ where: { orgId: { in: ids }, role: "OWNER", closedAt: null }, select: { id: true, orgId: true, displayName: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    db().job.groupBy({ by: ["orgId", "status"], where: { orgId: { in: ids } }, _count: { _all: true } }),
  ]);
  const emails = await emailsFor(owners.map((o) => o.id));
  const memberCount = new Map(members.map((m) => [m.orgId, m._count._all]));
  return orgs.map((o) => {
    const counts = { draft: 0, published: 0, other: 0 };
    for (const j of jobs) {
      if (j.orgId !== o.id) continue;
      if (j.status === "DRAFT") counts.draft += j._count._all;
      else if (j.status === "PUBLISHED") counts.published += j._count._all;
      else counts.other += j._count._all;
    }
    return {
      id: o.id,
      name: o.name,
      createdAt: o.createdAt,
      approved: o.approved,
      approvedAt: o.approvedAt,
      members: memberCount.get(o.id) ?? 0,
      owners: owners.filter((w) => w.orgId === o.id).map((w) => ({ profileId: w.id, name: w.displayName, email: emails.get(w.id) ?? null, since: w.createdAt })),
      gate: { contractorTerms: !!o.contractorTermsSignedAt, classificationReview: !!o.classificationReviewedAt, legalContact: !!o.legalContact?.trim() },
      jobs: counts,
    };
  });
}

/** The queue (M10.2): organizations awaiting approval, oldest first, then the approved ones, latest decision first. */
export async function listOrganizationsForAdmin(): Promise<{ awaiting: AdminOrgRow[]; approved: AdminOrgRow[] }> {
  const [awaiting, approved] = await Promise.all([
    db().organization.findMany({ where: { approved: false }, select: ORG_SELECT, orderBy: { createdAt: "asc" } }),
    db().organization.findMany({ where: { approved: true }, select: ORG_SELECT, orderBy: [{ approvedAt: "desc" }, { createdAt: "desc" }] }),
  ]);
  const [a, b] = await Promise.all([rowsFor(awaiting), rowsFor(approved)]);
  return { awaiting: a, approved: b };
}

/** One organization for the detail page, with Turfcut's decisions on it so far, newest first. */
export async function loadOrganizationForAdmin(orgId: string): Promise<(AdminOrgRow & { history: AdminOrgHistoryRow[] }) | null> {
  const org = await db().organization.findUnique({ where: { id: orgId }, select: ORG_SELECT });
  if (!org) return null;
  const [[row], history] = await Promise.all([
    rowsFor([org]),
    db().adminAction.findMany({
      where: { orgId, targetType: "Organization" },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 20,
      select: { id: true, action: true, reason: true, createdAt: true, staff: { select: { id: true, displayName: true, worker: { select: { displayName: true } } } } },
    }),
  ]);
  return { ...row, history: history.map((h) => ({ id: h.id, action: h.action, reason: h.reason, staffName: staffLabel(h.staff), createdAt: h.createdAt })) };
}

export type Decision = "approve" | "revoke";
export const isDecision = (raw: unknown): raw is Decision => raw === "approve" || raw === "revoke";

/** Why a decision would change nothing, in words the staff member reads; null when it goes ahead. */
export function decisionProblem(org: { approved: boolean }, decision: Decision): string | null {
  if (decision === "approve" && org.approved) return "This organization is already approved.";
  if (decision === "revoke" && !org.approved) return "This organization isn't approved, so there is nothing to withdraw.";
  return null;
}

/**
 * Turfcut's decision on an organization (M10.2): approve it for the pilot,
 * or withdraw the approval. One transaction records the change, the ledger
 * row with the reason, and a notice to every current owner. The update is
 * conditional on the standing it changes from, so two staff deciding at
 * once can't record the same decision twice.
 */
export async function decideOrganization(staff: StaffActor, orgId: string, decision: Decision, reason: unknown, now = new Date()): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = checkReason(reason);
  if (!r.ok) return r;
  const approve = decision === "approve";
  return db().$transaction(async (tx) => {
    const org = await tx.organization.findUnique({ where: { id: orgId }, select: { approved: true } });
    if (!org) return { ok: false, message: "That organization no longer exists." };
    const problem = decisionProblem(org, decision);
    if (problem) return { ok: false, message: problem };
    const changed = await tx.organization.updateMany({ where: { id: orgId, approved: !approve }, data: approve ? { approved: true, approvedAt: now } : { approved: false } });
    if (changed.count !== 1) return { ok: false, message: "Someone else just decided this. Reload to see the current standing." };
    await recordAdminAction(tx, { staff, action: approve ? "org.approved" : "org.approval_revoked", targetType: "Organization", targetId: orgId, orgId, reason: r.reason }, now);
    const owners = await tx.profile.findMany({ where: { orgId, role: "OWNER", closedAt: null }, select: { id: true } });
    if (owners.length) await tx.notification.createMany({ data: owners.map((o) => ({ recipientId: o.id, kind: approve ? ("ORG_APPROVED" as const) : ("ORG_APPROVAL_REVOKED" as const), createdAt: now })) });
    return { ok: true };
  });
}
