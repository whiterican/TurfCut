import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can } from "@/lib/access";
import type { Role } from "@/lib/auth";
import { UUID_RE } from "@/lib/jobs";
import { ACCEPTED_STATUSES } from "@/lib/engagements";
import { expiryState, expiryToday, methodsFor, ORG_METHODS, type VerificationMethod } from "@/lib/credentials";
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

/**
 * The organization's hired workers who share credentials with it, each with
 * their current credentials, or null when the organization can't verify
 * (its role, or Turfcut hasn't approved it). Only current rows are read.
 */
export async function loadHiredCredentials(staff: Staff) {
  if (!can(staff.role, "compliance")) return null;
  const org = await db().organization.findUnique({ where: { id: staff.orgId }, select: { approved: true } });
  if (!org?.approved) return null;
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
      where: { workerId: { in: ids }, removed: false, supersededBy: null },
      // What the organizations' shared view shows (never the number or the issue date), plus the row id to act on.
      select: { workerId: true, id: true, kind: true, label: true, state: true, expiresOn: true, verification: true, verificationMethod: true, verifiedAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const shares = ids.filter((id) => parts.get(id)?.credentials);
  const byOrg = await verifierOrgs(rows.filter((r) => r.verification === "ORGANIZATION" && shares.includes(r.workerId)).map((r) => r.id));
  return ids.map((workerId) => {
    const jobs = [...new Set(hired.filter((h) => h.workerId === workerId).map((h) => h.job.title))];
    const name = hired.find((h) => h.workerId === workerId)!.worker.displayName;
    return {
      workerId,
      name,
      jobs,
      credentials: shares.includes(workerId)
        ? rows.filter((r) => r.workerId === workerId).map(({ workerId: _w, ...r }) => {
            void _w;
            const byUs = byOrg.get(r.id) === staff.orgId;
            // When it was checked is the verifying organization's own record; others see only that it was, and how.
            return { ...r, verifiedAt: byUs ? r.verifiedAt : null, byUs };
          })
        : ("withheld" as const),
    };
  });
}

const NOT_FOUND = { ok: false as const, reason: "Credential not found." };
const STALE = { ok: false as const, reason: "This credential changed since you opened it. Reload to see the latest." };
const UNRECORDED = { ok: false as const, reason: "Turfcut couldn't record this check. Reload and try again." };

/**
 * A failed check as a message, or null to rethrow: a racing edit (the
 * unique supersedesId), a database check refusing the row, or a lock held
 * past the transaction's time limit. Logs only the error's code, never the
 * message (Postgres puts the whole row in it).
 */
export function checkFailure(e: unknown): { ok: false; reason: string } | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return STALE;
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028") {
    console.error("[turfcut] credential check timed out waiting for the worker");
    return UNRECORDED;
  }
  if (e instanceof Prisma.PrismaClientUnknownRequestError && /code: "23514"/.test(e.message)) {
    console.error("[turfcut] credential check refused by a database check (23514)");
    return UNRECORDED;
  }
  return null;
}

/**
 * Records that this organization checked a credential, and how. Every check
 * runs inside the transaction, under the worker's lock (closing the account
 * takes it) and the sharing lock (saving sharing choices takes it), so
 * neither can land between the checks and the record.
 */
export async function verifyCredential(staff: Staff, credentialId: string, method: string): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!can(staff.role, "compliance")) return { ok: false, reason: "Only owners and compliance members verify credentials." };
  if (!ORG_METHODS.includes(method as VerificationMethod)) return { ok: false, reason: "Say how you checked it." };
  if (!UUID_RE.test(credentialId)) return NOT_FOUND;
  // No worker lock for an organization that can't verify at all (checked again under the lock).
  if (!(await db().organization.findUnique({ where: { id: staff.orgId }, select: { approved: true } }))?.approved) return NOT_FOUND;
  try {
    return await db().$transaction(async (tx) => {
      const head = await tx.workerCredential.findUnique({ where: { id: credentialId }, select: { workerId: true } });
      if (!head) return NOT_FOUND;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`worker:${head.workerId}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`worker_sharing:${head.workerId}`}))`;
      const row0 = await tx.workerCredential.findUnique({
        where: { id: credentialId },
        select: { id: true, workerId: true, kind: true, label: true, state: true, identifier: true, issuedOn: true, expiresOn: true, verification: true, removed: true, supersededBy: { select: { id: true } }, worker: { select: { profileId: true } } },
      });
      if (!row0) return NOT_FOUND;
      const { removed, supersededBy, ...cur } = row0;
      const org = await tx.organization.findUnique({ where: { id: staff.orgId }, select: { approved: true } });
      const hired = await tx.engagement.count({ where: { workerId: cur.workerId, ...hiredWhere(staff.orgId), worker: { closedAt: null } } });
      const parts = await partsForOrgMany([cur.workerId], staff.orgId, { client: tx });
      // Not approved, never hired here, closed, or not shared with this organization: it reads as not found.
      if (!org?.approved || !hired || !parts.get(cur.workerId)?.credentials) return NOT_FOUND;
      // Replaced or taken down since the page was drawn (another check, or the worker's edit, got there first).
      if (removed || supersededBy) return STALE;
      if (cur.worker.profileId === staff.profileId) return { ok: false as const, reason: "You can't verify your own credential." };
      if (cur.verification !== "SELF_REPORTED") return { ok: false as const, reason: "This credential is already verified." };
      if (expiryState(cur.expiresOn, expiryToday()).kind === "expired") return { ok: false as const, reason: "This credential has expired. The worker updates it first." };
      if (!methodsFor(cur).includes(method as VerificationMethod)) return { ok: false as const, reason: "A state registry doesn't list this credential. Choose how you checked it." };
      const { id: _id, workerId, verification: _v, worker: _w, ...content } = cur;
      void _id;
      void _v;
      void _w;
      // The database's clock, as for createdAt (its checks compare the two), in UTC like every stored time.
      const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS "now"`;
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
    const failed = checkFailure(e);
    if (failed) return failed;
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
