import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Role } from "@/lib/auth";
import { recordAdminAction, staffLabel, type StaffActor } from "@/lib/admin-data";
import { checkReason } from "@/lib/admin-reason";
import { UUID_RE } from "@/lib/jobs";
import { emailsFor, INVITE_DAYS, LAST_OWNER, lockOrg, otherOwners, type InviteMailer } from "@/lib/members-data";
import { orgIdsByCampaignHandle } from "@/lib/campaign-admin-data";
import { approvalStanding, type ApprovalStanding } from "@/lib/admin-orgs-data";

/*
 * The people lookup (M10.4) shows what support needs and nothing a worker
 * controls: never political preferences, never the sharing-gated profile,
 * never a scorecard, never messages. Every select below is explicit.
 */

export type QueryKind = "id" | "email" | "handle" | "name";
export const QUERY_MIN = 2;
export const QUERY_MAX = 120;
export const HITS_MAX = 20;

/** What a search string looks like: an account id, a campaign handle (@…), an email, or a name. */
export function queryKind(q: string): QueryKind {
  const s = q.trim();
  if (UUID_RE.test(s)) return "id";
  if (s.startsWith("@")) return "handle";
  if (s.includes("@")) return "email";
  return "name";
}

export interface PersonHit {
  profileId: string;
  role: Role;
  staff: boolean;
  /** A worker's name, else a member's chat name. */
  name: string | null;
  email: string | null;
  createdAt: Date;
  closedAt: Date | null;
  org: { id: string; name: string; approved: boolean; standing: ApprovalStanding } | null;
}

const HIT_SELECT = {
  id: true, role: true, staffSince: true, displayName: true, createdAt: true, closedAt: true,
  worker: { select: { id: true, displayName: true } },
  org: { select: { id: true, name: true, approved: true, approvedAt: true } },
} satisfies Prisma.ProfileSelect;
type HitRecord = Prisma.ProfileGetPayload<{ select: typeof HIT_SELECT }>;
const toHit = (p: HitRecord, emails: Map<string, string>): PersonHit => ({
  profileId: p.id, role: p.role as Role, staff: !!p.staffSince, name: p.worker?.displayName || p.displayName || null, email: emails.get(p.id) ?? null,
  createdAt: p.createdAt, closedAt: p.closedAt, org: p.org ? { id: p.org.id, name: p.org.name, approved: p.org.approved, standing: approvalStanding(p.org) } : null,
});

/** Accounts matching a search (M10.4): by id, by email prefix (sign-in emails), by campaign handle (the organization's members), or by name. */
export async function searchPeople(raw: string): Promise<{ kind: QueryKind | null; hits: PersonHit[] }> {
  const q = raw.trim().slice(0, QUERY_MAX);
  if (q.length < QUERY_MIN) return { kind: null, hits: [] };
  const kind = queryKind(q);
  let where: Prisma.ProfileWhereInput;
  if (kind === "id") {
    // An account id, or a worker id pasted from the audit timeline.
    where = { OR: [{ id: q }, { worker: { id: q } }] };
  } else if (kind === "email") {
    // The address is a LIKE pattern: escape its wildcards (Postgres' default escape is a backslash) rather than drop them; underscores are common in addresses.
    const prefix = `${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await db().$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM auth.users WHERE lower(email) LIKE ${prefix} ORDER BY email LIMIT ${HITS_MAX}`;
    if (!rows.length) return { kind, hits: [] };
    where = { id: { in: rows.map((r) => r.id) } };
  } else if (kind === "handle") {
    const orgIds = await orgIdsByCampaignHandle(q);
    if (!orgIds.length) return { kind, hits: [] };
    where = { orgId: { in: orgIds }, role: { not: "WORKER" }, closedAt: null };
  } else {
    where = { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { worker: { displayName: { contains: q, mode: "insensitive" } } }] };
  }
  const profiles = await db().profile.findMany({ where, select: HIT_SELECT, orderBy: { createdAt: "asc" }, take: HITS_MAX });
  const emails = await emailsFor(profiles.map((p) => p.id));
  return { kind, hits: profiles.map((p) => toHit(p, emails)) };
}

export interface PersonInvite {
  id: string;
  orgId: string;
  orgName: string;
  role: Role;
  createdAt: Date;
  expiresAt: Date;
  expired: boolean;
}
export interface PersonHistoryRow {
  id: string;
  action: string;
  orgName: string | null;
  detail: string | null;
  createdAt: Date;
}
export interface PersonLedgerRow {
  id: string;
  action: string;
  reason: string;
  staffName: string;
  createdAt: Date;
}
export interface PersonDetail extends PersonHit {
  workerId: string | null;
  invites: PersonInvite[];
  /** The account's membership and account events from its own audit trail, newest first. */
  history: PersonHistoryRow[];
  /** Staff acts on this account, newest first. */
  ledger: PersonLedgerRow[];
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** One account for support (M10.4): who they are, where they belong, what is pending for them, and what happened to their membership. */
export async function loadPerson(profileId: string, now = new Date()): Promise<PersonDetail | null> {
  if (!UUID_RE.test(profileId)) return null;
  const p = await db().profile.findUnique({ where: { id: profileId }, select: HIT_SELECT });
  if (!p) return null;
  const emails = await emailsFor([p.id]);
  const email = emails.get(p.id) ?? null;
  const [invites, history, ledger] = await Promise.all([
    email
      ? db().orgInvite.findMany({ where: { email: email.toLowerCase(), acceptedAt: null, revokedAt: null }, select: { id: true, orgId: true, role: true, createdAt: true, expiresAt: true, org: { select: { name: true } } }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    db().auditEvent.findMany({
      where: { entityType: "Profile", entityId: p.id, OR: [{ action: { startsWith: "member." } }, { action: { startsWith: "account." } }] },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 20,
      select: { id: true, action: true, metadata: true, createdAt: true },
    }),
    db().adminAction.findMany({
      where: { targetType: "Profile", targetId: p.id },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 20,
      select: { id: true, action: true, reason: true, createdAt: true, staff: { select: { id: true, displayName: true, worker: { select: { displayName: true } } } } },
    }),
  ]);
  const orgIds = [...new Set(history.map((h) => obj(h.metadata).orgId).filter((x): x is string => typeof x === "string" && UUID_RE.test(x)))];
  const orgs = orgIds.length ? await db().organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }) : [];
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  return {
    ...toHit(p, emails),
    workerId: p.worker?.id ?? null,
    invites: invites.map((i) => ({ id: i.id, orgId: i.orgId, orgName: i.org.name, role: i.role as Role, createdAt: i.createdAt, expiresAt: i.expiresAt, expired: i.expiresAt <= now })),
    history: history.map((h) => {
      const m = obj(h.metadata);
      const detail = [typeof m.from === "string" && typeof m.to === "string" ? `${m.from} → ${m.to}` : null, typeof m.role === "string" ? m.role : null, m.by === "turfcut-staff" ? "by Turfcut staff" : null].filter(Boolean).join(" · ") || null;
      return { id: h.id, action: h.action, orgName: typeof m.orgId === "string" ? (orgName.get(m.orgId) ?? null) : null, detail, createdAt: h.createdAt };
    }),
    ledger: ledger.map((l) => ({ id: l.id, action: l.action, reason: l.reason, staffName: staffLabel(l.staff), createdAt: l.createdAt })),
  };
}

type Refusal = { ok: false; message: string };
/** A check the caller runs once the invite is known to be pending and its organization approved: the organization's own daily invite limit. */
export type InviteGate = (orgId: string) => Promise<{ ok: true } | Refusal>;

/**
 * Resend a pending invite on an organization's behalf (M10.4): the owner's
 * own rules (the organization must be approved; a failed send never revives
 * an invite; an address that can't join is never emailed, and the owner is
 * never told why), minus "you must be an owner". `sent` says whether an
 * email went out: staff see the account's standing on the same page, so for
 * them silence would only mislead. The organization's audit trail records
 * it by nobody in particular; the ledger records the staff member and why.
 */
export async function staffResendInvite(staff: StaffActor, inviteId: string, mail: InviteMailer, reason: unknown, now = new Date(), gate: InviteGate | null = null): Promise<{ ok: true; sent: boolean } | Refusal> {
  const r = checkReason(reason);
  if (!r.ok) return r;
  if (!UUID_RE.test(inviteId)) return { ok: false, message: "Invite not found." };
  const pre = await db().$transaction(async (tx) => {
    const inv = await tx.orgInvite.findUnique({ where: { id: inviteId }, select: { orgId: true, email: true, acceptedAt: true, revokedAt: true, org: { select: { approved: true } } } });
    if (!inv || inv.acceptedAt || inv.revokedAt) return { ok: false as const, message: "Invite not found, or no longer pending." };
    await lockOrg(tx, inv.orgId);
    if (!inv.org.approved) return { ok: false as const, message: "Invites open once Turfcut has approved the organization." };
    const users = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM auth.users WHERE lower(email) = ${inv.email}`;
    let canJoin = true;
    for (const u of users) {
      const p = await tx.profile.findUnique({ where: { id: u.id }, select: { role: true, orgId: true, closedAt: true } });
      if (p && (p.role === "WORKER" || p.orgId || p.closedAt)) canJoin = false;
    }
    return { ok: true as const, orgId: inv.orgId, email: inv.email, canJoin };
  });
  if (!pre.ok) return pre;
  if (gate) {
    const g = await gate(pre.orgId);
    if (!g.ok) return g;
  }
  const sent = !pre.canJoin ? { ok: true as const } : await mail(pre.email).catch((e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) }));
  if (!sent.ok) {
    console.error("[turfcut] invite email failed (staff resend)", sent.message);
    return { ok: false, message: "The email didn't send. Try again in a minute." };
  }
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * 86_400_000);
  return db().$transaction(async (tx) => {
    await lockOrg(tx, pre.orgId);
    const { count } = await tx.orgInvite.updateMany({ where: { id: inviteId, acceptedAt: null, revokedAt: null }, data: { expiresAt } });
    if (!count) return { ok: false as const, message: "Invite not found, or no longer pending." };
    await tx.auditEvent.create({ data: { actorId: null, action: "invite.resent", entityType: "OrgInvite", entityId: inviteId, metadata: { orgId: pre.orgId, by: "turfcut-staff" }, createdAt: now } });
    await recordAdminAction(tx, { staff, action: "invite.resent_for_org", targetType: "OrgInvite", targetId: inviteId, orgId: pre.orgId, reason: r.reason, metadata: { sent: pre.canJoin } }, now);
    return { ok: true as const, sent: pre.canJoin };
  });
}

/**
 * Remove a member from their organization on its behalf (M10.4): the owner's
 * own rules (the last owner stays; the login, role and history stay, access
 * ends), minus "you must be an owner". Audit trail by nobody in particular;
 * the ledger names the staff member and why.
 */
export async function staffRemoveMember(staff: StaffActor, profileId: string, reason: unknown, now = new Date()): Promise<{ ok: true; orgId: string } | Refusal> {
  const r = checkReason(reason);
  if (!r.ok) return r;
  if (!UUID_RE.test(profileId)) return { ok: false, message: "Member not found." };
  return db().$transaction(async (tx) => {
    const first = await tx.profile.findUnique({ where: { id: profileId }, select: { orgId: true } });
    if (!first?.orgId) return { ok: false as const, message: "That account isn't a member of an organization." };
    await lockOrg(tx, first.orgId);
    const p = await tx.profile.findUnique({ where: { id: profileId }, select: { id: true, role: true, orgId: true, closedAt: true } });
    if (!p || p.orgId !== first.orgId || p.closedAt || p.role === "WORKER") return { ok: false as const, message: "Member not found. Reload the page." };
    if (p.role === "OWNER" && !(await otherOwners(tx, p.orgId, p.id))) return { ok: false as const, message: LAST_OWNER };
    await tx.profile.update({ where: { id: p.id }, data: { orgId: null } });
    await tx.auditEvent.create({ data: { actorId: null, action: "member.removed", entityType: "Profile", entityId: p.id, metadata: { orgId: p.orgId, role: p.role, by: "turfcut-staff" }, createdAt: now } });
    await recordAdminAction(tx, { staff, action: "member.removed_for_org", targetType: "Profile", targetId: p.id, orgId: p.orgId, reason: r.reason, metadata: { role: p.role } }, now);
    return { ok: true as const, orgId: p.orgId };
  });
}
