import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type Tx = Prisma.TransactionClient;

/** The kinds of record a staff act can be about (M10). Each slice adds its own; the campaign verification queue's (M10.5) comes with the social layer's allowance. */
export type AdminTargetType = "Organization" | "JurisdictionProfile" | "Profile" | "OrgInvite";

/** What a staff act records (M10.1). The reason is in the staff member's words and is never optional. */
export interface AdminActionInput {
  staffId: string;
  /** Dotted, past tense, like audit events: "org.approved", "jurisdiction.version_approved". */
  action: string;
  targetType: AdminTargetType;
  targetId: string;
  /** The organization the act concerns, when there is one. */
  orgId?: string | null;
  reason: string;
  metadata?: Prisma.InputJsonValue;
}

export const REASON_MIN = 3;
export const REASON_MAX = 500;

/** A reason is a few words at least; whitespace alone is no reason. The trimmed reason, or what to tell the person. */
export function checkReason(raw: unknown): { ok: true; reason: string } | { ok: false; message: string } {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason.length < REASON_MIN) return { ok: false, message: "Say why, in a few words. Every staff action is recorded with its reason." };
  if (reason.length > REASON_MAX) return { ok: false, message: `Keep the reason under ${REASON_MAX} characters.` };
  return { ok: true, reason };
}

/**
 * Writes one row of the staff ledger, inside the caller's transaction so the
 * act and its record land together or not at all. Throws on a missing
 * reason, so no path can record an act without saying why; forms call
 * checkReason() first to show the message instead of failing.
 */
export async function recordAdminAction(tx: Tx, input: AdminActionInput, now = new Date()): Promise<{ id: string }> {
  const r = checkReason(input.reason);
  if (!r.ok) throw new Error(`admin action ${input.action} recorded without a reason: ${r.message}`);
  return tx.adminAction.create({
    data: {
      staffId: input.staffId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      orgId: input.orgId ?? null,
      reason: r.reason,
      metadata: input.metadata,
      createdAt: now,
    },
    select: { id: true },
  });
}

export interface RecentAdminAction {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  orgName: string | null;
  reason: string;
  staffName: string;
  createdAt: Date;
}

export interface AdminOverview {
  staffSince: Date | null;
  orgsAwaiting: number;
  orgsApproved: number;
  jurisdictionsCurrent: number;
  /** Current profiles that are unapproved or whose counsel approval has expired: their jobs are frozen. */
  jurisdictionsFrozen: number;
  recent: RecentAdminAction[];
}

/** How a staff member is named in the ledger: their chat display name, else a short id. Never an email on a page. */
export function staffLabel(p: { id: string; displayName: string | null }): string {
  return p.displayName ?? `Staff ${p.id.slice(0, 8)}`;
}

/**
 * The console's front page (M10.1): the queues' sizes, read from the tables
 * the later slices manage, and the last staff acts. (The campaign
 * verification queue's count arrives with M10.5, from the social layer's
 * own module.)
 */
export async function loadAdminOverview(staffId: string, now = new Date()): Promise<AdminOverview> {
  const [me, orgsAwaiting, orgsApproved, current, recent] = await Promise.all([
    db().profile.findUnique({ where: { id: staffId }, select: { staffSince: true } }),
    db().organization.count({ where: { approved: false } }),
    db().organization.count({ where: { approved: true } }),
    db().jurisdictionProfile.findMany({ where: { isCurrent: true }, select: { approved: true, approvalExpiresAt: true } }),
    db().adminAction.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, action: true, targetType: true, targetId: true, reason: true, createdAt: true, org: { select: { name: true } }, staff: { select: { id: true, displayName: true } } },
    }),
  ]);
  return {
    staffSince: me?.staffSince ?? null,
    orgsAwaiting,
    orgsApproved,
    jurisdictionsCurrent: current.length,
    jurisdictionsFrozen: current.filter((j) => !j.approved || (j.approvalExpiresAt !== null && j.approvalExpiresAt <= now)).length,
    recent: recent.map((a) => ({ id: a.id, action: a.action, targetType: a.targetType, targetId: a.targetId, orgName: a.org?.name ?? null, reason: a.reason, staffName: staffLabel(a.staff), createdAt: a.createdAt })),
  };
}
