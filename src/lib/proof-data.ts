import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can } from "@/lib/access";
import type { Role } from "@/lib/auth";
import { UUID_RE } from "@/lib/jobs";
import { expiryToday } from "@/lib/credentials";
import { partsForOrgMany } from "@/lib/shared-scorecard-data";
import { chainHeads, cleanPhoto, openPhoto, proofEligible, proofGone, proofKey, proofLapsed, proofLapsesOn, sealPhoto, PROOF_SIDES, type ChainRow, type ProofSide } from "@/lib/proof-photos";
import { proofPath, supabaseProofStore, type ProofStore } from "@/lib/proof-storage";

/**
 * Proof photos (C3.6b): the worker adds a photo of their Colorado
 * circulator training certificate, chooses whether organizations that
 * hire them may see it, and can take it down. Only an organization that
 * hired them (claimed or active on one of its jobs), only its owner and
 * compliance members, only photos the worker shared, and only while the
 * worker shares credentials with it. Every look is audited and shown to
 * the worker. Photos go when the credential is removed or no longer takes
 * one, a year after the training date, or when the account closes.
 */

type Tx = Prisma.TransactionClient;
type Client = ReturnType<typeof db> | Tx;
export type WorkerActor = { workerId: string; profileId: string };
export type Staff = { profileId: string; orgId: string; role: Role };
export type Viewer = ({ kind: "worker" } & WorkerActor) | ({ kind: "staff" } & Staff);

/** Hired and not yet done: the engagements during which an organization may look at shared photos. */
export const PHOTO_STATUSES = ["CLAIMED", "ACTIVE"] as const;
export const VIEW_ACTIONS = ["credential_proof.viewed", "credential_proof.downloaded"];

const NOT_FOUND = { ok: false as const, reason: "Credential not found." };
const STALE = { ok: false as const, reason: "This credential changed since you opened it. Reload to see the latest." };
const CHAIN: Prisma.WorkerCredentialSelect = { id: true, workerId: true, supersedesId: true, kind: true, state: true, issuedOn: true, removed: true };
type CredRow = ChainRow & { workerId: string };

const lock = (tx: Tx, workerId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`credential_proofs:${workerId}`}))`;

/**
 * Photos not yet deleted, with the current row of the credential each one
 * belongs to and why it must go now (null while it may stay). Access
 * checks read `gone` too, so a photo stops being shown the moment it
 * should go, whatever the purge's timing.
 */
async function liveProofs(where: Prisma.CredentialProofWhereInput, today: string, c: Client = db()) {
  const proofs = await c.credentialProof.findMany({
    where: { ...where, deletion: null },
    select: { id: true, workerId: true, credentialId: true, side: true, shared: true, createdAt: true, worker: { select: { closedAt: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (!proofs.length) return [];
  const rows = (await c.workerCredential.findMany({ where: { workerId: { in: [...new Set(proofs.map((p) => p.workerId))] } }, select: CHAIN })) as CredRow[];
  const heads = chainHeads(rows);
  return proofs.map((p) => {
    const head = heads.get(p.credentialId)!;
    return { ...p, side: p.side as ProofSide, head, gone: proofGone(head, !!p.worker.closedAt, today) };
  });
}

/** Why the worker can't add this side to this credential now, or null. */
async function slotProblem(c: Client, actor: WorkerActor, credentialId: string, side: ProofSide, today: string): Promise<{ ok: false; reason: string } | null> {
  const [worker, rows] = await Promise.all([
    c.worker.findUnique({ where: { id: actor.workerId }, select: { profileId: true, closedAt: true } }),
    c.workerCredential.findMany({ where: { workerId: actor.workerId }, select: CHAIN }) as Promise<CredRow[]>,
  ]);
  if (!worker || worker.profileId !== actor.profileId || worker.closedAt) return NOT_FOUND;
  const cur = rows.find((r) => r.id === credentialId);
  if (!cur) return NOT_FOUND;
  const heads = chainHeads(rows);
  if (heads.get(cur.id)!.id !== cur.id || cur.removed) return STALE;
  if (!proofEligible(cur)) return { ok: false, reason: "Only a Colorado circulator training certificate takes a photo. Add the state (CO) and the training date first." };
  if (proofLapsed(cur.issuedOn!, today)) return { ok: false, reason: "This training was more than a year ago, so the registration it supports has lapsed. Add your new training instead." };
  const chain = rows.filter((r) => heads.get(r.id)!.id === cur.id).map((r) => r.id);
  if (await c.credentialProof.count({ where: { credentialId: { in: chain }, side, deletion: null } })) {
    return { ok: false, reason: `There's already a photo of the ${side === "FRONT" ? "front" : "back"}. Remove it first.` };
  }
  return null;
}

/**
 * Adds a photo: checked, cleaned and sealed before it's stored, then
 * recorded under the worker's lock (re-checking the slot). A refused or
 * failed record deletes the stored file again.
 */
export async function addProof(
  actor: WorkerActor,
  input: { credentialId: string; side: string; shared: boolean; file: Uint8Array },
  store: ProofStore = supabaseProofStore(),
  now = new Date()
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!PROOF_SIDES.includes(input.side as ProofSide)) return { ok: false, reason: "Say which side of the certificate this is." };
  if (!UUID_RE.test(input.credentialId)) return NOT_FOUND;
  const side = input.side as ProofSide;
  const today = expiryToday(now);
  const pre = await slotProblem(db(), actor, input.credentialId, side, today);
  if (pre) return pre;
  const clean = await cleanPhoto(input.file);
  if (!clean.ok) return clean;
  const id = randomUUID();
  const path = proofPath(actor.workerId, id);
  await store.put(path, sealPhoto(proofKey(), id, clean.photo.bytes));
  const discard = () => store.remove([path]).catch((e: unknown) => console.error("[turfcut] couldn't remove a refused proof photo; the purge retries", String(e)));
  try {
    const r = await db().$transaction(async (tx) => {
      await lock(tx, actor.workerId);
      const again = await slotProblem(tx, actor, input.credentialId, side, today);
      if (again) return again;
      const { sha256, width, height, bytes } = clean.photo;
      await tx.credentialProof.create({
        data: { id, workerId: actor.workerId, credentialId: input.credentialId, side, sha256, sizeBytes: bytes.length, width, height, shared: input.shared, actorId: actor.profileId },
      });
      await tx.auditEvent.create({
        data: { actorId: actor.profileId, action: "credential_proof.added", entityType: "CredentialProof", entityId: id, metadata: { credentialId: input.credentialId, side, shared: input.shared } },
      });
      return { ok: true as const, id };
    });
    if (!r.ok) await discard();
    return r;
  } catch (e) {
    await discard();
    throw e;
  }
}

/** The worker takes a photo down: a deletion row, then the file. */
export async function removeProof(actor: WorkerActor, proofId: string, store: ProofStore = supabaseProofStore()): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!UUID_RE.test(proofId)) return { ok: false, reason: "Photo not found." };
  const r = await db().$transaction(async (tx) => {
    await lock(tx, actor.workerId);
    const p = await tx.credentialProof.findFirst({ where: { id: proofId, workerId: actor.workerId, deletion: null, worker: { profileId: actor.profileId } }, select: { id: true } });
    if (!p) return { ok: false as const, reason: "Photo not found." };
    await tx.credentialProofDeletion.create({ data: { proofId, reason: "WORKER_REMOVED", actorId: actor.profileId } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "credential_proof.removed", entityType: "CredentialProof", entityId: proofId } });
    return { ok: true as const };
  });
  if (r.ok) {
    await store.remove([proofPath(actor.workerId, proofId)]).catch((e: unknown) => console.error("[turfcut] proof photo file removal failed; the purge retries", String(e)));
  }
  return r;
}

/**
 * Deletes every photo that must go (one worker's, or everyone's for the
 * daily run): a deletion row with the reason, then the files. Every
 * deleted photo's file is removed again on each run (removing a missing
 * file is fine), so a removal that failed once is retried.
 */
export async function purgeProofs(store: ProofStore = supabaseProofStore(), opts: { workerId?: string } = {}, now = new Date()) {
  const today = expiryToday(now);
  const doomed = (await liveProofs(opts.workerId ? { workerId: opts.workerId } : {}, today)).filter((p) => p.gone);
  let deleted = 0;
  for (const p of doomed) {
    try {
      await db().$transaction([
        db().credentialProofDeletion.create({ data: { proofId: p.id, reason: p.gone!, actorId: null } }),
        db().auditEvent.create({ data: { actorId: null, action: "credential_proof.purged", entityType: "CredentialProof", entityId: p.id, metadata: { reason: p.gone } } }),
      ]);
      deleted++;
    } catch (e) {
      // Already deleted by another run or the worker: nothing to do.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  const gone = await db().credentialProofDeletion.findMany({
    where: opts.workerId ? { proof: { workerId: opts.workerId } } : {},
    select: { proof: { select: { id: true, workerId: true } } },
  });
  const paths = gone.map((d) => proofPath(d.proof.workerId, d.proof.id));
  for (let i = 0; i < paths.length; i += 500) await store.remove(paths.slice(i, i + 500));
  return { deleted, filesRemoved: paths.length };
}

/**
 * After the worker removes or edits a credential, or closes the account:
 * their photos that must go are deleted now rather than at the next daily
 * run. A failure here is logged; access checks already hide such photos,
 * and the daily purge deletes them.
 */
export async function purgeWorkerProofs(workerId: string, store?: ProofStore, now = new Date()) {
  try {
    if (!(await db().credentialProof.count({ where: { workerId, deletion: null } }))) return;
    await purgeProofs(store ?? supabaseProofStore(), { workerId }, now);
  } catch (e) {
    console.error("[turfcut] proof photo purge for one worker failed; the daily purge retries", String(e));
  }
}

/** Whether this organization may look at the worker's shared photos now (staff role and approval checked by the caller). */
async function orgMaySee(orgId: string, workerIds: string[], tx?: Tx) {
  const c = tx ?? db();
  const [hired, parts] = await Promise.all([
    c.engagement.findMany({ where: { workerId: { in: workerIds }, status: { in: [...PHOTO_STATUSES] }, job: { orgId } }, select: { workerId: true }, distinct: ["workerId"] }),
    partsForOrgMany(workerIds, orgId, tx ? { client: tx } : {}),
  ]);
  const ok = new Set(hired.map((h) => h.workerId));
  return new Set(workerIds.filter((w) => ok.has(w) && parts.get(w)?.credentials));
}

/**
 * A photo's bytes for someone allowed to see it, or null. Every look by an
 * organization is audited (view or download) before the file is read, and
 * the worker sees it; the worker's own looks are audited too.
 */
export async function openProof(viewer: Viewer, proofId: string, mode: "view" | "download", store: ProofStore = supabaseProofStore(), now = new Date()) {
  if (!UUID_RE.test(proofId)) return null;
  const [p] = await liveProofs({ id: proofId }, expiryToday(now));
  if (!p || p.gone) return null;
  if (viewer.kind === "worker") {
    const own = await db().worker.findFirst({ where: { id: p.workerId, profileId: viewer.profileId }, select: { id: true } });
    if (!own || viewer.workerId !== p.workerId) return null;
  } else {
    if (!can(viewer.role, "compliance") || !p.shared) return null;
    const org = await db().organization.findUnique({ where: { id: viewer.orgId }, select: { approved: true } });
    if (!org?.approved || !(await orgMaySee(viewer.orgId, [p.workerId])).has(p.workerId)) return null;
  }
  await db().auditEvent.create({
    data: {
      actorId: viewer.profileId,
      action: viewer.kind === "worker" ? "credential_proof.opened_by_worker" : mode === "download" ? "credential_proof.downloaded" : "credential_proof.viewed",
      entityType: "CredentialProof",
      entityId: p.id,
      metadata: viewer.kind === "worker" ? { workerId: p.workerId } : { workerId: p.workerId, orgId: viewer.orgId },
    },
  });
  const sealed = await store.get(proofPath(p.workerId, p.id));
  if (!sealed) {
    console.error("[turfcut] a live proof photo has no stored file", p.id);
    return null;
  }
  return { bytes: openPhoto(proofKey(), p.id, sealed), filename: `turfcut-certificate-${p.side === "FRONT" ? "front" : "back"}.jpg` };
}

/** Organizations' looks at each of these photos, for the worker: which organization, when, and whether it downloaded. */
async function looksAt(proofIds: string[]) {
  if (!proofIds.length) return new Map<string, Array<{ org: string; at: Date; download: boolean }>>();
  const events = await db().auditEvent.findMany({
    where: { entityType: "CredentialProof", entityId: { in: proofIds }, action: { in: VIEW_ACTIONS } },
    select: { entityId: true, action: true, createdAt: true, metadata: true },
    orderBy: { createdAt: "desc" },
  });
  const orgIds = [...new Set(events.map((e) => (e.metadata as { orgId?: string } | null)?.orgId).filter((x): x is string => !!x))];
  const names = new Map((await db().organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })).map((o) => [o.id, o.name]));
  const out = new Map<string, Array<{ org: string; at: Date; download: boolean }>>();
  for (const e of events) {
    const org = names.get((e.metadata as { orgId?: string } | null)?.orgId ?? "") ?? "An organization";
    out.set(e.entityId, [...(out.get(e.entityId) ?? []), { org, at: e.createdAt, download: e.action === "credential_proof.downloaded" }]);
  }
  return out;
}

/** The worker's current photos, by the id of the credential's current row, each with who has looked at it. */
export async function loadWorkerProofs(workerId: string, now = new Date()) {
  const live = (await liveProofs({ workerId }, expiryToday(now))).filter((p) => !p.gone);
  const looks = await looksAt(live.map((p) => p.id));
  const out = new Map<string, Array<{ id: string; side: ProofSide; shared: boolean; createdAt: Date; lapsesOn: string; looks: Array<{ org: string; at: Date; download: boolean }> }>>();
  for (const p of live) {
    out.set(p.head.id, [...(out.get(p.head.id) ?? []), { id: p.id, side: p.side, shared: p.shared, createdAt: p.createdAt, lapsesOn: proofLapsesOn(p.head.issuedOn!), looks: looks.get(p.id) ?? [] }]);
  }
  return out;
}

/**
 * The shared photos this organization may look at, by the id of each
 * credential's current row, with whether it has looked (any member). The
 * caller checks the role and approval.
 */
export async function loadOrgProofs(orgId: string, workerIds: string[], now = new Date(), tx?: Tx) {
  const c = tx ?? db();
  const out = new Map<string, Array<{ id: string; side: ProofSide; looked: boolean }>>();
  if (!workerIds.length) return out;
  const allowed = await orgMaySee(orgId, workerIds, tx);
  const live = (await liveProofs({ workerId: { in: [...allowed] }, shared: true }, expiryToday(now), c)).filter((p) => !p.gone);
  const looked = new Set(
    (await c.auditEvent.findMany({ where: { entityType: "CredentialProof", entityId: { in: live.map((p) => p.id) }, action: { in: VIEW_ACTIONS }, metadata: { path: ["orgId"], equals: orgId } }, select: { entityId: true } })).map((e) => e.entityId)
  );
  for (const p of live) out.set(p.head.id, [...(out.get(p.head.id) ?? []), { id: p.id, side: p.side, looked: looked.has(p.id) }]);
  return out;
}

/** For the worker's data export: every photo row (deleted ones too), the looks at them, and the current photos' files. */
export async function exportProofs(workerId: string, store: ProofStore | null, now = new Date()) {
  const rows = await db().credentialProof.findMany({
    where: { workerId },
    select: { id: true, credentialId: true, side: true, shared: true, sha256: true, sizeBytes: true, width: true, height: true, createdAt: true, deletion: { select: { reason: true, createdAt: true } } },
    orderBy: { createdAt: "asc" },
  });
  const looks = await looksAt(rows.map((r) => r.id));
  const live = (await liveProofs({ workerId }, expiryToday(now))).filter((p) => !p.gone);
  const files: Array<{ name: string; bytes: Uint8Array }> = [];
  let filesNote: string | null = null;
  if (live.length) {
    try {
      const s = store ?? supabaseProofStore();
      const key = proofKey();
      for (const p of live) {
        const sealed = await s.get(proofPath(workerId, p.id));
        if (sealed) files.push({ name: `credential-photos/${p.id}-${p.side === "FRONT" ? "front" : "back"}.jpg`, bytes: openPhoto(key, p.id, sealed) });
      }
    } catch (e) {
      console.error("[turfcut] export couldn't include proof photos", String(e));
      filesNote = "Your credential photos couldn't be included this time. Try the export again later.";
    }
  }
  return {
    rows: rows.map(({ deletion, ...r }) => ({ ...r, deletedAt: deletion?.createdAt ?? "", deletionReason: deletion?.reason ?? "" })),
    looks: rows.flatMap((r) => (looks.get(r.id) ?? []).map((l) => ({ photoId: r.id, organization: l.org, at: l.at, downloaded: l.download }))),
    files,
    filesNote,
  };
}
