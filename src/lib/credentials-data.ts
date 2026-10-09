import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { purgeWorkerProofs } from "@/lib/proof-data";
import { UUID_RE } from "@/lib/jobs";
import { partsForOrg } from "@/lib/shared-scorecard-data";
import { currentCredentials, orgCredentialView, validateCredential, type CredentialInput, type CredentialRow, type OrgCredentialView } from "@/lib/credentials";

const SELECT = {
  id: true, kind: true, label: true, state: true, identifier: true, issuedOn: true, expiresOn: true,
  verification: true, verificationMethod: true, supersedesId: true, removed: true, createdAt: true,
} as const;

/** The worker's wallet now (rows nothing supersedes, minus removals), newest first. */
export async function loadCredentials(workerId: string): Promise<Array<CredentialRow & { rootId: string }>> {
  const rows = await db().workerCredential.findMany({ where: { workerId }, select: SELECT });
  return currentCredentials(rows);
}

export type CredentialResult = { ok: true; id: string } | { ok: false; reason: string; errors?: Record<string, string> };

const day = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);
const data = (v: CredentialInput) => ({
  kind: v.kind, label: v.label, state: v.state, identifier: v.identifier, issuedOn: day(v.issuedOn), expiresOn: day(v.expiresOn),
});
const STALE = "This credential changed since you opened it. Reload to see the latest.";

/**
 * The worker's own current credential, or null. Anything else — another
 * worker's, a superseded or removed row, a malformed id — reads the same.
 */
async function ownCurrent(tx: Prisma.TransactionClient, workerId: string, id: string) {
  if (!UUID_RE.test(id)) return null;
  const row = await tx.workerCredential.findFirst({ where: { id, workerId, removed: false, supersededBy: null }, select: { id: true, kind: true, label: true, state: true, identifier: true, issuedOn: true, expiresOn: true } });
  return row;
}

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Adds a self-reported credential (the database refuses anything else from a worker). */
export async function addCredential(workerId: string, actorId: string, raw: unknown): Promise<CredentialResult> {
  const v = validateCredential(raw);
  if (!v.ok) return { ok: false, reason: "Fix the fields marked below.", errors: v.errors };
  return db().$transaction(async (tx) => {
    const row = await tx.workerCredential.create({ data: { workerId, actorId, ...data(v.value) }, select: { id: true } });
    await tx.auditEvent.create({ data: { actorId, action: "credential.added", entityType: "WorkerCredential", entityId: row.id, metadata: { kind: v.value.kind } } });
    return { ok: true as const, id: row.id };
  });
}

/**
 * Edits by appending a row that supersedes the current one. The kind stays
 * the same, and the edit is self-reported again: a verification never
 * carries over to changed details. A blank number keeps the current one
 * (the full number is never sent back to the phone), unless the worker asks
 * to take it off (clearIdentifier). Saving with nothing changed writes
 * nothing. Two edits racing on one row can't both land (unique
 * supersedesId); the loser is told to reload.
 */
export async function editCredential(workerId: string, actorId: string, id: string, raw: unknown): Promise<CredentialResult & { changed?: boolean }> {
  const v = validateCredential(raw);
  if (!v.ok) return { ok: false, reason: "Fix the fields marked below.", errors: v.errors };
  const clear = !!raw && typeof raw === "object" && (raw as Record<string, unknown>).clearIdentifier === true;
  try {
    const r = await db().$transaction(async (tx) => {
      const cur = await ownCurrent(tx, workerId, id);
      if (!cur) return { ok: false as const, reason: STALE };
      if (cur.kind !== v.value.kind) return { ok: false as const, reason: "A credential's kind can't change. Remove it and add a new one." };
      // A number typed in wins; otherwise blank keeps the saved one, or takes it off when asked.
      const next = { ...v.value, identifier: v.value.identifier ?? (clear ? null : cur.identifier) };
      const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);
      if (next.label === cur.label && next.state === cur.state && next.identifier === cur.identifier && next.issuedOn === d(cur.issuedOn) && next.expiresOn === d(cur.expiresOn)) {
        return { ok: true as const, id: cur.id, changed: false };
      }
      const row = await tx.workerCredential.create({ data: { workerId, actorId, ...data(next), supersedesId: cur.id }, select: { id: true } });
      await tx.auditEvent.create({ data: { actorId, action: "credential.edited", entityType: "WorkerCredential", entityId: row.id, metadata: { supersedes: cur.id } } });
      return { ok: true as const, id: row.id, changed: true };
    });
    // An edit can make the credential one that takes no photo (C3.6b).
    if (r.ok && r.changed) await purgeWorkerProofs(workerId);
    return r;
  } catch (e) {
    if (isUnique(e)) return { ok: false, reason: STALE };
    throw e;
  }
}

/** Takes a credential down by appending a removal row; the history stays (rule 3). */
export async function removeCredential(workerId: string, actorId: string, id: string): Promise<CredentialResult> {
  try {
    const r = await db().$transaction(async (tx) => {
      const cur = await ownCurrent(tx, workerId, id);
      if (!cur) return { ok: false as const, reason: STALE };
      const row = await tx.workerCredential.create({ data: { workerId, actorId, kind: cur.kind, removed: true, supersedesId: cur.id }, select: { id: true } });
      await tx.auditEvent.create({ data: { actorId, action: "credential.removed", entityType: "WorkerCredential", entityId: row.id, metadata: { removes: cur.id } } });
      return { ok: true as const, id: row.id };
    });
    // Its photos go with it (C3.6b).
    if (r.ok) await purgeWorkerProofs(workerId);
    return r;
  } catch (e) {
    if (isUnique(e)) return { ok: false, reason: STALE };
    throw e;
  }
}

/** The wallet as one organization may see it right now, or "withheld" (C2.5). */
export async function loadOrgCredentials(workerId: string, orgId: string): Promise<OrgCredentialView[] | "withheld"> {
  if (!(await partsForOrg(workerId, orgId)).credentials) return "withheld";
  return orgCredentialView(await loadCredentials(workerId), true);
}
