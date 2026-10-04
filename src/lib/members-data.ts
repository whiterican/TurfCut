import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ORG_ROLES } from "@/lib/access";
import { UUID_RE } from "@/lib/jobs";
import type { Role } from "@/lib/auth";

/**
 * Organization members and invites (C1). Owners invite by email and role;
 * the person joins when they first sign in with that email, proven by the
 * confirmation link. Removing a member detaches them (orgId = null): their
 * login and everything they did stay, and they lose access at once.
 */

export const INVITE_DAYS = 7;
const DAY = 86_400_000;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Tx = Prisma.TransactionClient;
type Fail = { ok: false; reason: string };
const fail = (reason: string): Fail => ({ ok: false, reason });
class Refusal extends Error {}
// One lock per organization's membership: the last-owner guard reads then writes.
const lockOrg = (tx: Tx, orgId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`org-members:${orgId}`}))`;
const lockEmail = (tx: Tx, email: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invite-email:${email}`}))`;

export interface Actor {
  userId: string;
  orgId: string;
}

/** Sends the invitation email. Injected so tests and acceptance runs never mail anyone. */
export type InviteMailer = (email: string) => Promise<{ ok: true } | { ok: false; message: string }>;

export function normalizeEmail(raw: unknown): string | null {
  const e = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

export function isOrgRole(raw: unknown): raw is Role {
  return typeof raw === "string" && ORG_ROLES.includes(raw as Role);
}

/** Emails for auth users, by id. Server only: auth.users is never exposed to clients. */
async function emailsFor(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db().$queryRaw<{ id: string; email: string | null }[]>`SELECT id::text AS id, email FROM auth.users WHERE id = ANY(${ids}::uuid[])`;
  return new Map(rows.filter((r) => r.email).map((r) => [r.id, r.email as string]));
}

export interface MemberRow {
  profileId: string;
  role: Role;
  name: string | null;
  email: string | null;
  since: Date;
}
export interface InviteRow {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  expiresAt: Date;
  expired: boolean;
}

export async function listMembers(orgId: string, now = new Date()): Promise<{ members: MemberRow[]; invites: InviteRow[] }> {
  const [profiles, invites] = await Promise.all([
    db().profile.findMany({
      where: { orgId, closedAt: null, role: { not: "WORKER" } },
      select: { id: true, role: true, displayName: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db().orgInvite.findMany({ where: { orgId, acceptedAt: null, revokedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  const emails = await emailsFor(profiles.map((p) => p.id));
  return {
    members: profiles.map((p) => ({ profileId: p.id, role: p.role as Role, name: p.displayName, email: emails.get(p.id) ?? null, since: p.createdAt })),
    invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role as Role, createdAt: i.createdAt, expiresAt: i.expiresAt, expired: i.expiresAt <= now })),
  };
}

/**
 * Why this email can't be invited to `orgId`, or null. An account in use
 * elsewhere gets one generic answer: the owner learns nothing about it.
 */
async function inviteBlocker(tx: Tx, orgId: string, email: string): Promise<string | null> {
  const users = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM auth.users WHERE lower(email) = ${email}`;
  for (const u of users) {
    const p = await tx.profile.findUnique({ where: { id: u.id }, select: { role: true, orgId: true, closedAt: true } });
    if (!p) continue; // signed up, never confirmed: the invite wins when they do
    if (p.orgId === orgId && !p.closedAt && p.role !== "WORKER") return "That person is already a member.";
    // A detached member (removed earlier) can be invited back.
    if (p.role !== "WORKER" && !p.orgId && !p.closedAt) continue;
    return "That email is already used by another Turfcut account. Ask them for a different address.";
  }
  const pending = await tx.orgInvite.findFirst({ where: { orgId, email, acceptedAt: null, revokedAt: null }, select: { id: true } });
  if (pending) return "There's already an invite for that email — resend or revoke it below.";
  return null;
}

export type InviteResult = { ok: true; inviteId: string; sent: boolean; message?: string } | Fail;

export async function inviteMember(actor: Actor, input: { email: unknown; role: unknown }, mail: InviteMailer, now = new Date()): Promise<InviteResult> {
  const email = normalizeEmail(input.email);
  if (!email) return fail("Enter a valid email address.");
  if (!isOrgRole(input.role)) return fail("Choose a role.");
  const role = input.role;
  let inviteId: string;
  try {
    inviteId = await db().$transaction(async (tx) => {
      await lockEmail(tx, email);
      const blocker = await inviteBlocker(tx, actor.orgId, email);
      if (blocker) throw new Refusal(blocker);
      const inv = await tx.orgInvite.create({
        data: { orgId: actor.orgId, email, role, invitedById: actor.userId, createdAt: now, expiresAt: new Date(now.getTime() + INVITE_DAYS * DAY) },
      });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: "member.invited", entityType: "OrgInvite", entityId: inv.id, metadata: { orgId: actor.orgId, email, role }, createdAt: now } });
      return inv.id;
    });
  } catch (e) {
    if (e instanceof Refusal) return fail(e.message);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail("There's already an invite for that email — resend or revoke it below.");
    throw e;
  }
  const sent = await mail(email).catch((e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) }));
  if (!sent.ok) {
    console.error("[turfcut] invite email failed", sent.message);
    return { ok: true, inviteId, sent: false, message: "Invite saved, but the email didn't send. Try Resend." };
  }
  return { ok: true, inviteId, sent: true };
}

export async function resendInvite(actor: Actor, inviteId: string, mail: InviteMailer, now = new Date()): Promise<{ ok: true } | Fail> {
  if (!UUID_RE.test(inviteId)) return fail("Invite not found.");
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * DAY);
  const inv = await db().orgInvite.findFirst({ where: { id: inviteId, orgId: actor.orgId, acceptedAt: null, revokedAt: null }, select: { email: true } });
  if (!inv) return fail("Invite not found.");
  const sent = await mail(inv.email).catch((e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) }));
  if (!sent.ok) {
    console.error("[turfcut] invite email failed", sent.message);
    return fail("The email didn't send. Try again in a minute.");
  }
  // Only a sent email moves the expiry, so a failed resend never revives an invite.
  const { count } = await db().orgInvite.updateMany({ where: { id: inviteId, orgId: actor.orgId, acceptedAt: null, revokedAt: null }, data: { expiresAt } });
  if (count) await db().auditEvent.create({ data: { actorId: actor.userId, action: "invite.resent", entityType: "OrgInvite", entityId: inviteId, metadata: { orgId: actor.orgId }, createdAt: now } });
  return count ? { ok: true } : fail("Invite not found.");
}

export async function revokeInvite(actor: Actor, inviteId: string, now = new Date()): Promise<{ ok: true } | Fail> {
  if (!UUID_RE.test(inviteId)) return fail("Invite not found.");
  return db().$transaction(async (tx) => {
    const { count } = await tx.orgInvite.updateMany({ where: { id: inviteId, orgId: actor.orgId, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });
    if (!count) return fail("Invite not found.");
    await tx.auditEvent.create({ data: { actorId: actor.userId, action: "invite.revoked", entityType: "OrgInvite", entityId: inviteId, metadata: { orgId: actor.orgId }, createdAt: now } });
    return { ok: true as const };
  });
}

/** Loads a current member of the actor's organization under the membership lock. */
async function memberFor(tx: Tx, actor: Actor, profileId: string) {
  await lockOrg(tx, actor.orgId);
  const p = await tx.profile.findUnique({ where: { id: profileId }, select: { id: true, role: true, orgId: true, closedAt: true } });
  if (!p || p.orgId !== actor.orgId || p.closedAt || p.role === "WORKER") return null;
  return p;
}

const LAST_OWNER = "An organization needs at least one owner. Make someone else an owner first.";
const otherOwners = (tx: Tx, orgId: string, profileId: string) =>
  tx.profile.count({ where: { orgId, role: "OWNER", closedAt: null, id: { not: profileId } } });

export async function changeMemberRole(actor: Actor, profileId: string, role: unknown, now = new Date()): Promise<{ ok: true } | Fail> {
  if (!isOrgRole(role)) return fail("Choose a role.");
  if (!UUID_RE.test(profileId)) return fail("Member not found.");
  return db().$transaction(async (tx) => {
    const p = await memberFor(tx, actor, profileId);
    if (!p) return fail("Member not found.");
    if (p.role === role) return { ok: true as const };
    if (p.role === "OWNER" && !(await otherOwners(tx, actor.orgId, p.id))) return fail(LAST_OWNER);
    await tx.profile.update({ where: { id: p.id }, data: { role } });
    await tx.auditEvent.create({ data: { actorId: actor.userId, action: "member.role_changed", entityType: "Profile", entityId: p.id, metadata: { orgId: actor.orgId, from: p.role, to: role }, createdAt: now } });
    return { ok: true as const };
  });
}

export async function removeMember(actor: Actor, profileId: string, now = new Date()): Promise<{ ok: true } | Fail> {
  if (!UUID_RE.test(profileId)) return fail("Member not found.");
  return db().$transaction(async (tx) => {
    const p = await memberFor(tx, actor, profileId);
    if (!p) return fail("Member not found.");
    if (p.role === "OWNER" && !(await otherOwners(tx, actor.orgId, p.id))) return fail(LAST_OWNER);
    // Detach: the login, role and history stay; access to the organization ends
    // (the chat trigger closes their conversations on the same update).
    await tx.profile.update({ where: { id: p.id }, data: { orgId: null } });
    await tx.auditEvent.create({ data: { actorId: actor.userId, action: "member.removed", entityType: "Profile", entityId: p.id, metadata: { orgId: actor.orgId, role: p.role }, createdAt: now } });
    return { ok: true as const };
  });
}

/** A verified, signed-in auth user (from getUser or a fresh confirmation). */
export interface VerifiedUser {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}

/**
 * Joins the person to the organization behind their newest unexpired invite,
 * if their email is confirmed and they have no profile yet or are a detached
 * member. Roles come only from the invite, never from user metadata. Returns
 * true when they joined.
 */
export async function acceptInvite(user: VerifiedUser, opts: { name?: string | null; now?: Date } = {}): Promise<boolean> {
  const now = opts.now ?? new Date();
  const email = normalizeEmail(user.email);
  if (!email || !user.email_confirmed_at) return false;
  return db().$transaction(async (tx) => {
    await lockEmail(tx, email);
    const profile = await tx.profile.findUnique({ where: { id: user.id }, select: { role: true, orgId: true, closedAt: true } });
    if (profile && (profile.role === "WORKER" || profile.orgId || profile.closedAt)) return false;
    const inv = await tx.orgInvite.findFirst({
      where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (!inv) return false;
    await lockOrg(tx, inv.orgId);
    const { count } = await tx.orgInvite.updateMany({ where: { id: inv.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: now, acceptedById: user.id } });
    if (!count) return false;
    if (profile) {
      await tx.profile.update({ where: { id: user.id }, data: { role: inv.role, orgId: inv.orgId } });
    } else {
      await tx.profile.create({ data: { id: user.id, role: inv.role, orgId: inv.orgId, displayName: opts.name ?? null } });
    }
    await tx.auditEvent.create({
      data: { actorId: user.id, action: "member.joined", entityType: "Profile", entityId: user.id, metadata: { orgId: inv.orgId, inviteId: inv.id, role: inv.role, rejoined: !!profile }, createdAt: now },
    });
    return true;
  });
}
