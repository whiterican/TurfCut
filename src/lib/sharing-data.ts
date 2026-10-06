import { db } from "@/lib/db";
import { orgHasRelationship } from "@/lib/political-fit-data";
import {
  DEFAULT_SHARING,
  sameSharing,
  SHARING_TEXT_VERSION,
  sharingFromRow,
  sharingToRow,
  validateSharing,
  type SharingChoices,
  type Viewer,
} from "@/lib/sharing";

export interface LoadedSharing {
  choices: SharingChoices;
  /** null = never saved: the choices are DEFAULT_SHARING. */
  version: number | null;
  savedAt: Date | null;
}

/** The latest saved choices, or the defaults when the worker never saved any. */
export async function loadSharing(workerId: string): Promise<LoadedSharing> {
  const row = await db().workerSharing.findFirst({ where: { workerId }, orderBy: { version: "desc" } });
  return row
    ? { choices: sharingFromRow(row), version: row.version, savedAt: row.createdAt }
    : { choices: DEFAULT_SHARING, version: null, savedAt: null };
}

export type SaveSharingResult =
  | { ok: true; changed: boolean; version: number }
  | { ok: false; errors: Record<string, string> };

/**
 * Appends a new version. Never updates an existing row. Re-saving the saved
 * choices under the same wording is a no-op; a worker's first save is always
 * recorded, even when it equals the defaults, so "confirmed" and "never
 * looked" stay distinguishable and a wording change asks everyone again.
 *
 * Saves for one worker are serialized with a transaction-scoped advisory
 * lock, so concurrent saves each get the next version in turn. The unique
 * (workerId, version) index is the backstop if anything bypasses this.
 */
export async function saveSharing(workerId: string, actorId: string, raw: unknown): Promise<SaveSharingResult> {
  // Refuse a malformed save before taking the lock.
  const pre = validateSharing(raw);
  if (!pre.ok) return pre;
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`worker_sharing:${workerId}`}))`;
    const row = await tx.workerSharing.findFirst({ where: { workerId }, orderBy: { version: "desc" } });
    // A setting the save doesn't mention (read receipts, until C3 puts them
    // on a screen) keeps its saved value, read under the lock.
    const omitsReceipts = !!raw && typeof raw === "object" && (raw as Record<string, unknown>).readReceipts === undefined;
    const choices = omitsReceipts ? { ...pre.value, readReceipts: row?.readReceipts ?? false } : pre.value;
    if (row && row.consentTextVersion === SHARING_TEXT_VERSION && sameSharing(sharingFromRow(row), choices)) {
      return { ok: true as const, changed: false, version: row.version };
    }
    const version = (row?.version ?? 0) + 1;
    await tx.workerSharing.create({
      data: { workerId, version, ...sharingToRow(choices), consentTextVersion: SHARING_TEXT_VERSION, actorId },
    });
    // Records that the worker chose, and the version; the choices are in the row.
    await tx.auditEvent.create({
      data: {
        actorId,
        action: "sharing.saved",
        entityType: "Worker",
        entityId: workerId,
        metadata: { version, consentTextVersion: SHARING_TEXT_VERSION },
      },
    });
    return { ok: true as const, changed: true, version };
  });
}

/**
 * How an organization's staff member counts as a viewer of this worker. A
 * closed account shows nothing to anyone (M7), whatever its saved choices.
 */
export async function orgViewer(workerId: string, orgId: string): Promise<Viewer> {
  const [org, worker, relationship] = await Promise.all([
    db().organization.findUnique({ where: { id: orgId }, select: { approved: true } }),
    db().worker.findUnique({ where: { id: workerId }, select: { closedAt: true } }),
    orgHasRelationship(workerId, orgId),
  ]);
  if (!worker || worker.closedAt) return { kind: "public" };
  return { kind: "org", approved: org?.approved ?? false, relationship };
}
