import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { INVITE_ROLES, ORG_ROLES } from "@/lib/access";
import { UUID_RE } from "@/lib/jobs";
import type { Role } from "@/lib/auth";

/**
 * Organization members and invites (C1). Owners of approved organizations
 * invite by email and role. Someone new joins by opening the invite email
 * (their first sign-in proves the address); anyone who already has a
 * Turfcut login only ever joins by pressing Accept. Removing a member
 * detaches them (orgId = null): their login and everything they did stay,
 * and they lose access at once.
 */

export const INVITE_DAYS = 7;
const DAY = 86_400_000;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Tx = Prisma.TransactionClient;
type Fail = { ok: false; reason: string };
const fail = (reason: string): Fail => ({ ok: false, reason });
class Refusal extends Error {}
const orgApproved = async (tx: Tx, orgId: string) => !!(await tx.organization.findUnique({ where: { id: orgId }, select: { approved: true } }))?.approved;
// One lock per organization's membership: the last-owner guard reads then writes.
const lockOrg = (tx: Tx, orgId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`org-members:${orgId}`}))`;
const lockEmail = (tx: Tx, email: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invite-email:${email}`}))`;

/**
 * Re-checks, inside the transaction, that the actor is still an owner of the
 * organization (the page guard ran before it; an owner removed meanwhile
 * must not finish a change). Call after lockOrg.
 */
async function stillOwner(tx: Tx, actor: Actor): Promise<boolean> {
  const me = await tx.profile.findUnique({ where: { id: actor.userId }, select: { role: true, orgId: true, closedAt: true } });
  return !!me && me.role === "OWNER" && me.orgId === actor.orgId && !me.closedAt;
}
const NOT_OWNER = "Only an owner of this organization can manage members.";
const UNAPPROVED = "Invites open once Turfcut has approved your organization.";

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

/** A role an owner may invite someone as, or assign (INVITE_ROLES). */
export function isInviteRole(raw: unknown): raw is Role {
  return typeof raw === "string" && (INVITE_ROLES as string[]).includes(raw);
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
 * Whether this email can be invited to `orgId`. A pending invite or a current
 * member is refused (the owner can see both on the members page). An email
 * that belongs to an account which can't join — a worker, another
 * organization's member — gets an invite that is saved but never emailed
 * and can never be accepted, so the reply is the same as for anyone else
 * and owners can't use invites to learn who has a Turfcut account.
 */
async function inviteCheck(tx: Tx, orgId: string, email: string): Promise<{ refuse: string } | { mail: boolean }> {
  const pending = await tx.orgInvite.findFirst({ where: { orgId, email, acceptedAt: null, revokedAt: null }, select: { expiresAt: true } });
  if (pending) {
    return { refuse: pending.expiresAt <= new Date() ? "That email's invite has expired — resend or revoke it below." : "There's already an invite for that email — resend or revoke it below." };
  }
  const users = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM auth.users WHERE lower(email) = ${email}`;
  let mail = true;
  for (const u of users) {
    const p = await tx.profile.findUnique({ where: { id: u.id }, select: { role: true, orgId: true, closedAt: true } });
    if (!p) continue; // signed up, never confirmed
    if (p.orgId === orgId && !p.closedAt && p.role !== "WORKER") return { refuse: "That person is already a member." };
    if (p.role !== "WORKER" && !p.orgId && !p.closedAt) continue; // a removed member can be invited back
    mail = false;
  }
  return { mail };
}

export type InviteResult = { ok: true; inviteId: string; sent: boolean; message?: string } | Fail;

export async function inviteMember(actor: Actor, input: { email: unknown; role: unknown }, mail: InviteMailer, now = new Date()): Promise<InviteResult> {
  const email = normalizeEmail(input.email);
  if (!email) return fail("Enter a valid email address.");
  if (!isInviteRole(input.role)) return fail("Choose a role.");
  const role = input.role;
  let made: { inviteId: string; mail: boolean };
  try {
    made = await db().$transaction(async (tx) => {
      await lockEmail(tx, email);
      await lockOrg(tx, actor.orgId);
      if (!(await stillOwner(tx, actor))) throw new Refusal(NOT_OWNER);
      if (!(await orgApproved(tx, actor.orgId))) throw new Refusal(UNAPPROVED);
      const c = await inviteCheck(tx, actor.orgId, email);
      if ("refuse" in c) throw new Refusal(c.refuse);
      const inv = await tx.orgInvite.create({
        data: { orgId: actor.orgId, email, role, invitedById: actor.userId, createdAt: now, expiresAt: new Date(now.getTime() + INVITE_DAYS * DAY) },
      });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: "member.invited", entityType: "OrgInvite", entityId: inv.id, metadata: { orgId: actor.orgId, email, role, emailed: c.mail }, createdAt: now } });
      return { inviteId: inv.id, mail: c.mail };
    });
  } catch (e) {
    if (e instanceof Refusal) return fail(e.message);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail("There's already an invite for that email — resend or revoke it below.");
    throw e;
  }
  const { inviteId } = made;
  if (!made.mail) return { ok: true, inviteId, sent: true };
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
  const pre = await db().$transaction(async (tx) => {
    await lockOrg(tx, actor.orgId);
    if (!(await stillOwner(tx, actor))) return fail(NOT_OWNER);
    if (!(await orgApproved(tx, actor.orgId))) return fail(UNAPPROVED);
    const inv = await tx.orgInvite.findFirst({ where: { id: inviteId, orgId: actor.orgId, acceptedAt: null, revokedAt: null }, select: { email: true } });
    if (!inv) return fail("Invite not found.");
    // The pending invite itself doesn't block its own resend.
    const users = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM auth.users WHERE lower(email) = ${inv.email}`;
    let canJoin = true;
    for (const u of users) {
      const p = await tx.profile.findUnique({ where: { id: u.id }, select: { role: true, orgId: true, closedAt: true } });
      if (p && (p.role === "WORKER" || p.orgId || p.closedAt)) canJoin = false;
    }
    return { ok: true as const, email: inv.email, canJoin };
  });
  if (!pre.ok) return pre;
  const sent = !pre.canJoin ? { ok: true as const } : await mail(pre.email).catch((e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) }));
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
    await lockOrg(tx, actor.orgId);
    if (!(await stillOwner(tx, actor))) return fail(NOT_OWNER);
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
  if (!isInviteRole(role)) return fail("Choose a role.");
  if (!UUID_RE.test(profileId)) return fail("Member not found.");
  return db().$transaction(async (tx) => {
    await lockOrg(tx, actor.orgId);
    if (!(await stillOwner(tx, actor))) return fail(NOT_OWNER);
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
    await lockOrg(tx, actor.orgId);
    if (!(await stillOwner(tx, actor))) return fail(NOT_OWNER);
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

const confirmedEmail = (user: VerifiedUser) => (user.email_confirmed_at ? normalizeEmail(user.email) : null);

/** Unexpired invites waiting for this person's confirmed email, newest first. */
export async function pendingInvitesFor(user: VerifiedUser, now = new Date()) {
  const email = confirmedEmail(user);
  if (!email) return [];
  return db().orgInvite.findMany({
    where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    select: { id: true, role: true, expiresAt: true, org: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Joins the person to an organization they were invited to. Roles come only
 * from the invite, never from user metadata, and the invite must match the
 * person's confirmed email.
 * - Someone brand new (no profile) — the invite email created their login —
 *   joins on opening that invite link, if it's their only open invite (with
 *   several, they choose on /welcome). ensureAccount calls this only when
 *   they brought no sign-up details of their own.
 * - A removed (detached) member joins only the invite they chose
 *   (`inviteId`), by pressing Accept. Nobody with a login is ever pulled
 *   into an organization without asking.
 * Returns true when they joined.
 */
export async function acceptInvite(user: VerifiedUser, opts: { inviteId?: string; name?: string | null; now?: Date } = {}): Promise<boolean> {
  const now = opts.now ?? new Date();
  const email = confirmedEmail(user);
  if (!email) return false;
  if (opts.inviteId !== undefined && !UUID_RE.test(opts.inviteId)) return false;
  return db().$transaction(async (tx) => {
    await lockEmail(tx, email);
    const profile = await tx.profile.findUnique({ where: { id: user.id }, select: { role: true, orgId: true, closedAt: true } });
    if (profile && (profile.role === "WORKER" || profile.orgId || profile.closedAt || !opts.inviteId)) return false;
    // Without a chosen invite, join only when there is exactly one to choose:
    // with several, the link they clicked can't say which, so they pick.
    const found = await tx.orgInvite.findMany({
      where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now }, ...(opts.inviteId ? { id: opts.inviteId } : {}) },
      take: 2,
    });
    if (found.length !== 1) return false;
    const inv = found[0];
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
