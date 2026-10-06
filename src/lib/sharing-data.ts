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
  | { ok: true; changed: boolean; version: number | null }
  | { ok: false; errors: Record<string, string> };

/**
 * Appends a new version. Never updates an existing row. Saving the choices
 * already in force (including the defaults, before any save) is a no-op.
 *
 * Saves for one worker are serialized with a transaction-scoped advisory
 * lock, so concurrent saves each get the next version in turn. The unique
 * (workerId, version) index is the backstop if anything bypasses this.
 */
export async function saveSharing(workerId: string, actorId: string, raw: unknown): Promise<SaveSharingResult> {
  const v = validateSharing(raw);
  if (!v.ok) return v;
  const choices = v.value;
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`worker_sharing:${workerId}`}))`;
    const row = await tx.workerSharing.findFirst({ where: { workerId }, orderBy: { version: "desc" } });
    const current = row ? sharingFromRow(row) : DEFAULT_SHARING;
    if (sameSharing(current, choices) && (!row || row.consentTextVersion === SHARING_TEXT_VERSION)) {
      return { ok: true as const, changed: false, version: row?.version ?? null };
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

/** How an organization's staff member counts as a viewer of this worker. */
export async function orgViewer(workerId: string, orgId: string): Promise<Viewer> {
  const [org, relationship] = await Promise.all([
    db().organization.findUnique({ where: { id: orgId }, select: { approved: true } }),
    orgHasRelationship(workerId, orgId),
  ]);
  return { kind: "org", approved: org?.approved ?? false, relationship };
}
