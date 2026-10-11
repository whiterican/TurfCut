import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { releaseDeadline, releaseOpen } from "@/lib/job-changes";
import { notifyStep } from "@/lib/notifications-data";

/**
 * A hired worker's release after a material change to the job (C4.3):
 * within RELEASE_HOURS of the change they may leave the job, their
 * unstarted shifts cancelled as excused (never a no-show), the engagement
 * withdrawn with a history line that says why. Ending is final for that
 * job, as for any withdrawal (C3 decision).
 */

const HIRE_EVENTS = ["CLAIMED", "OFFER_ACCEPTED", "INVITE_ACCEPTED"] as const;
const lock = (tx: Parameters<Parameters<ReturnType<typeof db>["$transaction"]>[0]>[0], key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

/** When the worker was hired on this engagement: the newest hire step, else when the engagement began. */
async function hiredAt(engagementId: string, createdAt: Date) {
  const ev = await db().engagementEvent.findFirst({ where: { engagementId, type: { in: [...HIRE_EVENTS] } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  return ev?.createdAt ?? createdAt;
}

/**
 * The change a hired worker may still leave over, for the job page: the
 * newest material change since they were hired, while its window is open.
 */
export async function openRelease(engagement: { id: string; jobId: string; status: string; createdAt: Date }, now = new Date()) {
  if (engagement.status !== "CLAIMED" && engagement.status !== "ACTIVE") return null;
  const since = await hiredAt(engagement.id, engagement.createdAt);
  const change = await db().jobChange.findFirst({ where: { jobId: engagement.jobId, createdAt: { gt: since }, NOT: { material: { isEmpty: true } } }, orderBy: { createdAt: "desc" }, select: { id: true, material: true, createdAt: true } });
  if (!change || !releaseOpen(change, since, now)) return null;
  return { ...change, deadline: releaseDeadline(change.createdAt) };
}

/** The worker leaves a changed job with no penalty. */
export async function releaseFromJob(actor: { workerId: string; profileId: string }, engagementId: string, now = new Date()): Promise<{ ok: true; cancelledShifts: number } | { ok: false; reason: string }> {
  if (!UUID_RE.test(engagementId)) return { ok: false, reason: "Engagement not found." };
  return db().$transaction(async (tx) => {
    await lock(tx, `worker:${actor.workerId}`);
    const e = await tx.engagement.findFirst({
      where: { id: engagementId, workerId: actor.workerId, worker: { profileId: actor.profileId } },
      select: { id: true, jobId: true, status: true, createdAt: true, hiredById: true, worker: { select: { profileId: true, closedAt: true } }, job: { select: { orgId: true } } },
    });
    if (!e) return { ok: false as const, reason: "Engagement not found." };
    if (e.status !== "CLAIMED" && e.status !== "ACTIVE") return { ok: false as const, reason: "Only a hired worker leaves this way." };
    const release = await openRelease(e, now);
    if (!release) return { ok: false as const, reason: "The 24 hours to leave over a change have passed, or nothing changed since you were hired." };
    await lock(tx, `job:${e.jobId}`);
    // Unstarted shifts go first, each marked as a job-change release so the scorecard reads it as excused.
    const future = await tx.shift.findMany({ where: { engagementId: e.id, status: "SCHEDULED", endsAt: { gt: now } }, select: { id: true }, orderBy: { id: "asc" } });
    const payload = { by: "WORKER", reason: "The job's terms changed", jobChanged: true, jobChangeId: release.id };
    let cancelled = 0;
    for (const s of future) {
      const { count } = await tx.shift.updateMany({ where: { id: s.id, status: "SCHEDULED" }, data: { status: "CANCELLED" } });
      if (!count) continue;
      cancelled++;
      await tx.workEvent.create({ data: { shiftId: s.id, type: "SHIFT_CANCELLED", payload, actorId: actor.profileId, createdAt: now } });
      await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "shift.cancelled", entityType: "Shift", entityId: s.id, metadata: payload, createdAt: now } });
    }
    const { count } = await tx.engagement.updateMany({ where: { id: e.id, status: e.status }, data: { status: "WITHDRAWN" } });
    if (!count) return { ok: false as const, reason: "This engagement changed since you opened the page. Reload to see the latest." };
    await tx.engagementEvent.create({ data: { engagementId: e.id, type: "WITHDRAWN", actorId: actor.profileId, note: "Left after the job's terms changed (no penalty).", createdAt: now } });
    await notifyStep(tx, "WITHDRAWN", e, actor.profileId, now);
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "engagement.released", entityType: "Engagement", entityId: e.id, metadata: { jobChangeId: release.id, cancelledShifts: cancelled }, createdAt: now } });
    return { ok: true as const, cancelledShifts: cancelled };
  });
}
