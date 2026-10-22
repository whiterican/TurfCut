import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseGrants, type Grants } from "@/lib/access";
import { UUID_RE } from "@/lib/jobs";
import { endManagerChats, lockOrg } from "@/lib/members-data";
import { ROLES_MAX, validateRole, type RoleInput } from "@/lib/org-roles";
import type { Role } from "@/lib/auth";

/**
 * An organization's own roles (M10.6). Only an owner builds them (a role
 * is a statement of what the organization trusts someone with), under the
 * same lock membership changes take, so assigning a role and archiving it
 * can't cross. Roles are never deleted: a role nobody holds is archived,
 * and what it reached stays readable on the audit trail.
 */

type Tx = Prisma.TransactionClient;
type Fail = { ok: false; reason: string; errors?: Record<string, string> };
const fail = (reason: string, errors?: Record<string, string>): Fail => ({ ok: false, reason, ...(errors ? { errors } : {}) });
class Refusal extends Error {}

export interface RoleActor {
  userId: string;
  orgId: string;
}

export interface OrgRoleRow {
  id: string;
  name: string;
  description: string;
  basedOn: Role | null;
  createdAt: Date;
  archivedAt: Date | null;
  grants: Grants;
  /** Current members on it, and invites still waiting that carry it. */
  members: number;
  invites: number;
}

const toGrantRows = (g: Grants) => Object.entries(g).map(([area, level]) => ({ area, level: level === "full" ? ("FULL" as const) : ("READ" as const) }));

/** The organization's roles, live ones first (by name), then archived. */
export async function listOrgRoles(orgId: string, now = new Date()): Promise<OrgRoleRow[]> {
  const roles = await db().orgRole.findMany({
    where: { orgId },
    select: { id: true, name: true, description: true, basedOn: true, createdAt: true, archivedAt: true, grants: { select: { area: true, level: true } } },
    orderBy: [{ name: "asc" }],
  });
  if (!roles.length) return [];
  const ids = roles.map((r) => r.id);
  const [members, invites] = await Promise.all([
    db().profile.groupBy({ by: ["orgRoleId"], where: { orgId, orgRoleId: { in: ids }, closedAt: null }, _count: { _all: true } }),
    db().orgInvite.groupBy({ by: ["orgRoleId"], where: { orgId, orgRoleId: { in: ids }, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } }, _count: { _all: true } }),
  ]);
  const m = new Map(members.map((x) => [x.orgRoleId, x._count._all]));
  const i = new Map(invites.map((x) => [x.orgRoleId, x._count._all]));
  const rows = roles.map((r) => ({ id: r.id, name: r.name, description: r.description, basedOn: r.basedOn as Role | null, createdAt: r.createdAt, archivedAt: r.archivedAt, grants: parseGrants(r.grants), members: m.get(r.id) ?? 0, invites: i.get(r.id) ?? 0 }));
  return [...rows.filter((r) => !r.archivedAt), ...rows.filter((r) => r.archivedAt)];
}

/** The organization's live roles, for a role select. */
export const liveOrgRoles = (orgId: string) => db().orgRole.findMany({ where: { orgId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });

/** Re-checks, inside the transaction and after the lock, that the actor is still an owner of the organization. */
async function stillOwner(tx: Tx, actor: RoleActor): Promise<boolean> {
  const me = await tx.profile.findUnique({ where: { id: actor.userId }, select: { role: true, orgId: true, closedAt: true } });
  return !!me && me.role === "OWNER" && me.orgId === actor.orgId && !me.closedAt;
}
const NOT_OWNER = "Only an owner of this organization can build roles.";

const nameTaken = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const TAKEN = fail("Fix the highlighted fields.", { name: "You already have a role with that name." });

const grantsMeta = (g: Grants) => g as Prisma.InputJsonObject;

export async function createOrgRole(actor: RoleActor, input: RoleInput, now = new Date()): Promise<{ ok: true; id: string } | Fail> {
  try {
    return await db().$transaction(async (tx) => {
      await lockOrg(tx, actor.orgId);
      if (!(await stillOwner(tx, actor))) throw new Refusal(NOT_OWNER);
      if ((await tx.orgRole.count({ where: { orgId: actor.orgId, archivedAt: null } })) >= ROLES_MAX) throw new Refusal(`An organization can have ${ROLES_MAX} roles. Archive one nobody holds first.`);
      const role = await tx.orgRole.create({
        data: { orgId: actor.orgId, name: input.name, description: input.description, basedOn: input.basedOn, createdById: actor.userId, createdAt: now, grants: { create: toGrantRows(input.grants) } },
        select: { id: true },
      });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: "org_role.created", entityType: "OrgRole", entityId: role.id, metadata: { orgId: actor.orgId, name: input.name, basedOn: input.basedOn, grants: grantsMeta(input.grants) }, createdAt: now } });
      return { ok: true as const, id: role.id };
    });
  } catch (e) {
    if (e instanceof Refusal) return fail(e.message);
    if (nameTaken(e)) return TAKEN;
    throw e;
  }
}

/** Renames a role, changes its description and replaces what it reaches. Members on it have the new reach on their next page. */
export async function updateOrgRole(actor: RoleActor, id: string, input: RoleInput, now = new Date()): Promise<{ ok: true } | Fail> {
  if (!UUID_RE.test(id)) return fail("Role not found.");
  try {
    return await db().$transaction(async (tx) => {
      await lockOrg(tx, actor.orgId);
      if (!(await stillOwner(tx, actor))) throw new Refusal(NOT_OWNER);
      const cur = await tx.orgRole.findFirst({ where: { id, orgId: actor.orgId }, select: { name: true, archivedAt: true, grants: { select: { area: true, level: true } } } });
      if (!cur) throw new Refusal("Role not found.");
      if (cur.archivedAt) throw new Refusal("An archived role can't be changed. Make a new one.");
      await tx.orgRole.update({ where: { id }, data: { name: input.name, description: input.description } });
      await tx.orgRoleGrant.deleteMany({ where: { roleId: id } });
      await tx.orgRoleGrant.createMany({ data: toGrantRows(input.grants).map((g) => ({ roleId: id, ...g })) });
      // Members who ran team chats through this role stop when it loses Messages (no Profile column changes, so the database trigger can't see it).
      if (input.grants.messages !== "full") await endManagerChats(tx, actor.orgId, { orgRoleId: id });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: "org_role.updated", entityType: "OrgRole", entityId: id, metadata: { orgId: actor.orgId, name: input.name, before: grantsMeta(parseGrants(cur.grants)), after: grantsMeta(input.grants), renamedFrom: cur.name !== input.name ? cur.name : null }, createdAt: now } });
      return { ok: true as const };
    });
  } catch (e) {
    if (e instanceof Refusal) return fail(e.message);
    if (nameTaken(e)) return TAKEN;
    throw e;
  }
}

/** Archives a role nobody holds: no current member, no invite still waiting. Its name stays taken and its history readable. */
export async function archiveOrgRole(actor: RoleActor, id: string, now = new Date()): Promise<{ ok: true } | Fail> {
  if (!UUID_RE.test(id)) return fail("Role not found.");
  return db().$transaction(async (tx) => {
    await lockOrg(tx, actor.orgId);
    if (!(await stillOwner(tx, actor))) return fail(NOT_OWNER);
    const role = await tx.orgRole.findFirst({ where: { id, orgId: actor.orgId }, select: { name: true, archivedAt: true } });
    if (!role) return fail("Role not found.");
    if (role.archivedAt) return { ok: true as const };
    const [members, invites] = await Promise.all([
      tx.profile.count({ where: { orgId: actor.orgId, orgRoleId: id, closedAt: null } }),
      tx.orgInvite.count({ where: { orgId: actor.orgId, orgRoleId: id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } }),
    ]);
    if (members || invites) {
      const who = [members ? `${members} ${members === 1 ? "member holds" : "members hold"} it` : null, invites ? `${invites} ${invites === 1 ? "invite carries" : "invites carry"} it` : null].filter(Boolean).join(" and ");
      return fail(`Can't archive it yet: ${who}. Move them to another role first.`);
    }
    await tx.orgRole.update({ where: { id }, data: { archivedAt: now } });
    await tx.auditEvent.create({ data: { actorId: actor.userId, action: "org_role.archived", entityType: "OrgRole", entityId: id, metadata: { orgId: actor.orgId, name: role.name }, createdAt: now } });
    return { ok: true as const };
  });
}

export { validateRole };
