import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can } from "@/lib/access";
import type { Role } from "@/lib/auth";
import { UUID_RE } from "@/lib/jobs";
import { ACCEPTED_STATUSES } from "@/lib/engagements";
import { currentCredentials, expiryState, expiryToday, ORG_METHODS, type VerificationMethod } from "@/lib/credentials";
import { partsForOrgMany } from "@/lib/shared-scorecard-data";

/**
 * Credential checks by organizations (C3.6a). An organization Turfcut
 * approves may verify a credential of a worker it hired (claimed, active or
 * completed on one of its jobs), while that worker shares credentials with
 * it, and only its owner and compliance members: they record how they
 * checked. Verifying appends a row that supersedes the current one (rule 3);
 * any later edit by the worker is self-reported again. Other organizations
 * see "Verified by an organization" and how, never which one.
 */

type Staff = { profileId: string; orgId: string; role: Role };

const hiredWhere = (orgId: string) => ({ status: { in: ACCEPTED_STATUSES }, job: { orgId } });

/**
 * Which organization verified each row, from the audit trail written with
 * it: the verifier's membership can change later, the record of who checked
 * can't.
 */
async function verifierOrgs(rowIds: string[]) {
  if (!rowIds.length) return new Map<string, string>();
  const events = await db().auditEvent.findMany({
    where: { action: "credential.verified", entityType: "WorkerCredential", entityId: { in: rowIds } },
    select: { entityId: true, metadata: true },
  });
  const out = new Map<string, string>();
  for (const e of events) {
    const orgId = (e.metadata as { orgId?: unknown } | null)?.orgId;
    if (typeof orgId === "string") out.set(e.entityId, orgId);
  }
  return out;
}

/** The organization's hired workers who share credentials with it, each with their current credentials. */
export async function loadHiredCredentials(staff: Staff) {
  if (!can(staff.role, "compliance")) return [];
  const org = await db().organization.findUnique({ where: { id: staff.orgId }, select: { approved: true } });
  if (!org?.approved) return [];
  const hired = await db().engagement.findMany({
    where: { ...hiredWhere(staff.orgId), worker: { closedAt: null } },
    select: { workerId: true, worker: { select: { displayName: true } }, job: { select: { title: true } } },
    orderBy: { createdAt: "asc" },
  });
  const ids = [...new Set(hired.map((h) => h.workerId))];
  if (!ids.length) return [];
  const [parts, rows] = await Promise.all([
    partsForOrgMany(ids, staff.orgId),
    db().workerCredential.findMany({
      where: { workerId: { in: ids } },
      select: { workerId: true, id: true, kind: true, label: true, state: true, issuedOn: true, expiresOn: true, verification: true, verificationMethod: true, verifiedAt: true, supersedesId: true, removed: true, createdAt: true },
    }),
  ]);
  const current = currentCredentials(rows);
  const byOrg = await verifierOrgs(current.filter((r) => r.verification === "ORGANIZATION").map((r) => r.id));
  return ids.map((workerId) => {
    const jobs = [...new Set(hired.filter((h) => h.workerId === workerId).map((h) => h.job.title))];
    const name = hired.find((h) => h.workerId === workerId)!.worker.displayName;
    const shared = parts.get(workerId)?.credentials ?? false;
    return {
      workerId,
      name,
      jobs,
      credentials: shared
        ? current.filter((r) => r.workerId === workerId).map((r) => ({ ...r, byUs: byOrg.get(r.id) === staff.orgId }))
        : ("withheld" as const),
    };
  });
}

/** Records that this organization checked a credential, and how. */
export async function verifyCredential(staff: Staff, credentialId: string, method: string): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!can(staff.role, "compliance")) return { ok: false, reason: "Only owners and compliance members verify credentials." };
  if (!ORG_METHODS.includes(method as VerificationMethod)) return { ok: false, reason: "Say how you checked it." };
  if (!UUID_RE.test(credentialId)) return { ok: false, reason: "Credential not found." };
  const cur = await db().workerCredential.findFirst({
    where: { id: credentialId, removed: false, supersededBy: null },
    select: { id: true, workerId: true, kind: true, label: true, state: true, identifier: true, issuedOn: true, expiresOn: true, verification: true, worker: { select: { profileId: true } } },
  });
  if (!cur) return { ok: false, reason: "Credential not found." };
  const [org, hired, parts] = await Promise.all([
    db().organization.findUnique({ where: { id: staff.orgId }, select: { approved: true } }),
    db().engagement.count({ where: { workerId: cur.workerId, ...hiredWhere(staff.orgId), worker: { closedAt: null } } }),
    partsForOrgMany([cur.workerId], staff.orgId),
  ]);
  // Not approved, never hired here, or not shared with this organization: it reads as not found.
  if (!org?.approved || !hired || !parts.get(cur.workerId)?.credentials) return { ok: false, reason: "Credential not found." };
  if (cur.worker.profileId === staff.profileId) return { ok: false, reason: "You can't verify your own credential." };
  if (cur.verification !== "SELF_REPORTED") return { ok: false, reason: "This credential is already verified." };
  if (expiryState(cur.expiresOn, expiryToday()).kind === "expired") return { ok: false, reason: "This credential has expired. The worker updates it first." };
  try {
    return await db().$transaction(async (tx) => {
      const { id: _id, workerId, verification: _v, worker: _w, ...content } = cur;
      void _id;
      void _v;
      void _w;
      // The database's clock, which also stamps createdAt: its checks compare the two.
      const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const row = await tx.workerCredential.create({
        data: { ...content, workerId, supersedesId: cur.id, verification: "ORGANIZATION", verifiedById: staff.profileId, verifiedAt: now, verificationMethod: method as VerificationMethod, actorId: staff.profileId },
        select: { id: true },
      });
      await tx.auditEvent.create({
        data: { actorId: staff.profileId, action: "credential.verified", entityType: "WorkerCredential", entityId: row.id, metadata: { supersedes: cur.id, orgId: staff.orgId, method } },
      });
      return { ok: true as const, id: row.id };
    });
  } catch (e) {
    // Two checks (or a check and the worker's edit) racing on one row: the unique supersedesId lets one through.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, reason: "This credential changed since you opened it. Reload to see the latest." };
    throw e;
  }
}

/** For the worker: which organization verified each of their credentials, and how (theirs to know). */
export async function loadVerifiers(workerId: string) {
  const rows = await db().workerCredential.findMany({
    where: { workerId, verification: "ORGANIZATION" },
    select: { id: true, verifiedAt: true, verificationMethod: true },
  });
  const byOrg = await verifierOrgs(rows.map((r) => r.id));
  const orgIds = [...new Set(byOrg.values())];
  const names = new Map((await db().organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })).map((o) => [o.id, o.name]));
  return new Map(rows.map((r) => [r.id, { org: names.get(byOrg.get(r.id) ?? "") ?? null, at: r.verifiedAt, method: r.verificationMethod }]));
}
