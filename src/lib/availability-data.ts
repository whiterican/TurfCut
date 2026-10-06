import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { availabilityFromRow, availabilitySummary, EMPTY_AVAILABILITY, isEmptyAvailability, sameAvailability, validateAvailability, type Availability } from "@/lib/availability";
import { partsForOrg } from "@/lib/shared-scorecard-data";

export interface LoadedAvailability {
  availability: Availability;
  /** null = never saved. */
  version: number | null;
  savedAt: Date | null;
}

export async function loadAvailability(workerId: string): Promise<LoadedAvailability> {
  const row = await db().workerAvailability.findFirst({ where: { workerId }, orderBy: { version: "desc" } });
  return row
    ? { availability: availabilityFromRow(row), version: row.version, savedAt: row.createdAt }
    : { availability: EMPTY_AVAILABILITY, version: null, savedAt: null };
}

export type SaveAvailabilityResult =
  | { ok: true; changed: boolean; version: number | null }
  | { ok: false; errors: Record<string, string> };

/**
 * Appends a new version; never updates a row. Saving what's already saved
 * (or an empty week before any save) is a no-op. Saves for one worker are
 * serialized with an advisory lock; the unique (workerId, version) index is
 * the backstop.
 */
export async function saveAvailability(workerId: string, actorId: string, raw: unknown): Promise<SaveAvailabilityResult> {
  const v = validateAvailability(raw);
  if (!v.ok) return v;
  const a = v.value;
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`worker_availability:${workerId}`}))`;
    const row = await tx.workerAvailability.findFirst({ where: { workerId }, orderBy: { version: "desc" } });
    if (sameAvailability(row ? availabilityFromRow(row) : EMPTY_AVAILABILITY, a)) {
      return { ok: true as const, changed: false, version: row?.version ?? null };
    }
    const version = (row?.version ?? 0) + 1;
    await tx.workerAvailability.create({
      data: {
        workerId,
        version,
        weekly: a.weekly as Prisma.InputJsonValue,
        exceptions: a.exceptions as unknown as Prisma.InputJsonValue,
        note: a.note,
        actorId,
      },
    });
    await tx.auditEvent.create({
      data: { actorId, action: "availability.saved", entityType: "Worker", entityId: workerId, metadata: { version } },
    });
    return { ok: true as const, changed: true, version };
  });
}

/**
 * Availability as one organization may see it, right now: the plain summary
 * when the worker shares it with this organization (C2.4), "withheld" when
 * not, null when shared but nothing is set. Closed accounts show nothing.
 */
export async function loadOrgAvailability(workerId: string, orgId: string, today = new Date().toISOString().slice(0, 10)) {
  const [parts, { availability }] = await Promise.all([partsForOrg(workerId, orgId), loadAvailability(workerId)]);
  if (!parts.availability) return "withheld" as const;
  return isEmptyAvailability(availability) ? null : availabilitySummary(availability, today);
}
