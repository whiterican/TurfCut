import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { availabilityFromRow, EMPTY_AVAILABILITY, orgAvailabilityView, sameAvailability, validateAvailability, withoutPastDates, type Availability, type OrgAvailabilityView } from "@/lib/availability";
import { partsForOrg, partsForOrgMany } from "@/lib/shared-scorecard-data";

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
export async function saveAvailability(workerId: string, actorId: string, raw: unknown, today = new Date().toISOString().slice(0, 10)): Promise<SaveAvailabilityResult> {
  const v = validateAvailability(raw);
  if (!v.ok) return v;
  const a = withoutPastDates(v.value, today);
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
 * not (including closed accounts, which orgViewer treats as the public), null
 * when shared but nothing is set.
 */
export async function loadOrgAvailability(workerId: string, orgId: string, today = new Date().toISOString().slice(0, 10)): Promise<OrgAvailabilityView> {
  if (!(await partsForOrg(workerId, orgId)).availability) return "withheld";
  return orgAvailabilityView((await loadAvailability(workerId)).availability, true, today);
}

/**
 * loadOrgAvailability for a list of workers in five queries, whatever its
 * length (the applicants page). Same rules: the worker's latest sharing
 * choice, the organization's approval, a relationship from the worker's own
 * engagements, closed accounts withheld.
 */
export async function loadOrgAvailabilities(workerIds: string[], orgId: string, today = new Date().toISOString().slice(0, 10)) {
  const ids = [...new Set(workerIds)];
  const out = new Map<string, OrgAvailabilityView>();
  if (!ids.length) return out;
  const [parts, rows] = await Promise.all([
    partsForOrgMany(ids, orgId),
    db().workerAvailability.findMany({ where: { workerId: { in: ids } }, orderBy: [{ workerId: "asc" }, { version: "desc" }], distinct: ["workerId"] }),
  ]);
  const avail = new Map(rows.map((r) => [r.workerId, availabilityFromRow(r)]));
  for (const id of ids) out.set(id, orgAvailabilityView(avail.get(id) ?? EMPTY_AVAILABILITY, parts.get(id)?.availability ?? false, today));
  return out;
}
