/**
 * Stop outcomes (W2), the database half. The worker holding a walkbook
 * records what happened at each of its stops; every outcome is a new row and
 * the newest row of a stop is its state (rule 3). A book carries its state
 * with it: a stop marked Come back stays open for whoever holds the book
 * next.
 *
 * Recording takes the same per-walkbook lock as handing the book out
 * (walkbooks-data.ts), so a take-back and a tap can't both win: an outcome is
 * recorded only while the book is still the worker's.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { latestByStop, progressFromRecorded, validateOutcome, type OutcomeKind, type Progress, type StopState } from "@/lib/stop-outcomes";

type Fail = { ok: false; reason: string; errors?: Record<string, string>; /** The stop isn't this worker's to record on (unknown, handed on, taken back): nothing to retry. */ gone?: true };
export type WorkerActor = { workerId: string; profileId: string };

const lock = (tx: Prisma.TransactionClient, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
const HIRED = ["ACTIVE", "CLAIMED"] as const;
const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();

/**
 * Records one outcome. `clientId` is made on the worker's device when the
 * form opens: a double tap or a retried request carries the same id and
 * records once.
 */
export async function recordStopOutcome(
  actor: WorkerActor,
  stopIdRaw: unknown,
  clientIdRaw: unknown,
  raw: Record<string, unknown>,
  now = new Date()
): Promise<{ ok: true; walkbookId: string; jobId: string; repeated: boolean } | Fail> {
  const stopId = lower(stopIdRaw);
  const clientId = lower(clientIdRaw);
  if (!UUID_RE.test(stopId)) return { ok: false, reason: "Stop not found." };
  if (!UUID_RE.test(clientId)) return { ok: false, reason: "Something went wrong with that tap. Try again." };
  return db().$transaction(async (tx) => {
    const stop = await tx.walkbookStop.findUnique({ where: { id: stopId }, select: { id: true, walkbookId: true, walkbook: { select: { jobId: true, job: { select: { type: true } } } } } });
    if (!stop) return { ok: false as const, reason: "Stop not found.", gone: true as const };
    await lock(tx, `walkbook:${stop.walkbookId}`);
    // Who holds the book now: its newest assignment, and only if that is one of this worker's hired engagements.
    const held = await tx.walkbookAssignment.findFirst({ where: { walkbookId: stop.walkbookId }, orderBy: { createdAt: "desc" }, select: { engagementId: true } });
    const engagement = held?.engagementId
      ? await tx.engagement.findFirst({ where: { id: held.engagementId, workerId: actor.workerId, status: { in: [...HIRED] }, worker: { closedAt: null } }, select: { id: true } })
      : null;
    // Not theirs (or not found): the same answer, so nobody learns which stops exist.
    if (!engagement) return { ok: false as const, reason: "Stop not found.", gone: true as const };

    const existing = await tx.stopOutcome.findUnique({ where: { id: clientId }, select: { stopId: true, engagementId: true } });
    if (existing) return existing.stopId === stop.id && existing.engagementId === engagement.id ? { ok: true as const, walkbookId: stop.walkbookId, jobId: stop.walkbook.jobId, repeated: true } : { ok: false as const, reason: "Something went wrong with that tap. Try again." };

    const v = validateOutcome(stop.walkbook.job.type, raw);
    if (!v.ok) return { ok: false as const, reason: v.reason, errors: v.errors };
    // Under the lock: strictly after the stop's newest row, so "newest wins" never ties.
    const newest = await tx.stopOutcome.findFirst({ where: { stopId: stop.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    const at = newest && newest.createdAt >= now ? new Date(newest.createdAt.getTime() + 1) : now;
    // The shift under way, if there is one; recording doesn't need a shift.
    const shift = await tx.shift.findFirst({ where: { engagementId: engagement.id, status: "ACTIVE" }, orderBy: { startsAt: "desc" }, select: { id: true } });
    // Two books don't share a lock: a device id reused on another book by a racing request lands on the primary key.
    try {
      await tx.stopOutcome.create({
        data: {
          id: clientId,
          stopId: stop.id,
          engagementId: engagement.id,
          shiftId: shift?.id ?? null,
          outcome: v.value.outcome,
          recordedById: actor.profileId,
          createdAt: at,
          answers: { create: v.value.answers.map((a) => ({ key: a.key, intValue: a.intValue, boolValue: a.boolValue })) },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false as const, reason: "Something went wrong with that tap. Try again." };
      throw e;
    }
    return { ok: true as const, walkbookId: stop.walkbookId, jobId: stop.walkbook.jobId, repeated: false };
  });
}

/** Each given stop's state now. Stops with no outcome are absent from the map (they are unvisited). */
export async function loadStopStates(stopIds: string[]): Promise<Map<string, StopState>> {
  if (!stopIds.length) return new Map();
  const rows = await db().$queryRaw<Array<{ id: string; stopId: string; outcome: OutcomeKind; createdAt: Date }>>`
    SELECT DISTINCT ON (o."stopId") o."id", o."stopId", o."outcome"::text AS outcome, o."createdAt"
    FROM "public"."StopOutcome" o
    WHERE o."stopId" = ANY(${stopIds}::uuid[])
    ORDER BY o."stopId", o."createdAt" DESC, o."id" DESC`;
  if (!rows.length) return new Map();
  // Only the answers that belong to each stop's newest row.
  const answers = await db().stopOutcomeAnswer.findMany({ where: { outcomeId: { in: rows.map((r) => r.id) } }, select: { outcomeId: true, key: true, intValue: true, boolValue: true } });
  const byOutcome = new Map<string, typeof answers>();
  for (const a of answers) byOutcome.set(a.outcomeId, [...(byOutcome.get(a.outcomeId) ?? []), a]);
  return latestByStop(rows.map((r) => ({ stopId: r.stopId, createdAt: r.createdAt, outcome: r.outcome, answers: byOutcome.get(r.id) ?? [] })));
}

/** Progress of every walkbook on a job, from each stop's newest outcome, in one query. */
export async function loadJobProgress(jobId: string, totals: Map<string, number>): Promise<Map<string, Progress>> {
  const rows = await db().$queryRaw<Array<{ walkbookId: string; outcome: OutcomeKind; signatures: number | null }>>`
    SELECT DISTINCT ON (o."stopId") s."walkbookId", o."outcome"::text AS outcome,
      (SELECT a."intValue" FROM "public"."StopOutcomeAnswer" a WHERE a."outcomeId" = o."id" AND a."key" = 'signatures') AS signatures
    FROM "public"."StopOutcome" o
    JOIN "public"."WalkbookStop" s ON s."id" = o."stopId"
    JOIN "public"."Walkbook" w ON w."id" = s."walkbookId"
    WHERE w."jobId" = ${jobId}::uuid
    ORDER BY o."stopId", o."createdAt" DESC, o."id" DESC`;
  const byBook = new Map<string, StopState[]>();
  for (const r of rows) {
    const list = byBook.get(r.walkbookId) ?? [];
    list.push({ outcome: r.outcome, answers: r.signatures === null ? {} : { signatures: r.signatures } });
    byBook.set(r.walkbookId, list);
  }
  return new Map([...totals].map(([id, total]) => [id, progressFromRecorded(total, byBook.get(id) ?? [])]));
}
