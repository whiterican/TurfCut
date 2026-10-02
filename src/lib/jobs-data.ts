import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  exclusionReasons,
  publishBlockers,
  readDisclosure,
  UUID_RE,
  type FeedFilters,
  type JobInput,
} from "@/lib/jobs";
import { effectivePreference } from "@/lib/political-fit";
import { loadLatestPreference } from "@/lib/political-fit-data";

const json = (v: unknown) => v as Prisma.InputJsonValue;

function jobData(input: JobInput) {
  return {
    type: input.type,
    title: input.title,
    description: input.description,
    jurisdictionId: input.jurisdictionId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    geography: json({ city: input.city, state: input.state }),
    compensationMethod: input.compensationMethod,
    payRateCents: input.payRateCents,
    headcount: input.headcount,
    hiringMethod: json({ modes: input.hiringModes }),
    requirements: json(input.requirements),
    campaignDisclosure: json(input.disclosure),
    supportContacts: json(input.supportContacts),
    measureIds: input.measureIds,
    cancellationNoticeHours: input.cancellationNoticeHours,
  };
}

/** Creates a DRAFT job. Publishing is a separate, gated step. */
export async function createJob(orgId: string, actorId: string, input: JobInput) {
  return db().$transaction(async (tx) => {
    const job = await tx.job.create({ data: { ...jobData(input), orgId, status: "DRAFT" } });
    await tx.auditEvent.create({
      data: { actorId, action: "job.created", entityType: "Job", entityId: job.id, metadata: { status: "DRAFT" } },
    });
    return job;
  });
}

/** Edits a job while it is still a draft. Returns false if it isn't. */
export async function updateDraftJob(jobId: string, orgId: string, actorId: string, input: JobInput) {
  if (!UUID_RE.test(jobId)) return false;
  return db().$transaction(async (tx) => {
    const { count } = await tx.job.updateMany({ where: { id: jobId, orgId, status: "DRAFT" }, data: jobData(input) });
    if (count === 0) return false;
    await tx.auditEvent.create({ data: { actorId, action: "job.edited", entityType: "Job", entityId: jobId } });
    return true;
  });
}

/**
 * Publishes a job if — and only if — the gate passes at this moment. Runs
 * under a per-job lock so the check and the status change can't interleave.
 */
export async function publishJob(
  jobId: string,
  orgId: string,
  actorId: string,
  now: Date = new Date()
): Promise<{ ok: true } | { ok: false; reasons: string[] }> {
  if (!UUID_RE.test(jobId)) return { ok: false, reasons: ["Job not found."] };
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`job:${jobId}`}))`;
    const job = await tx.job.findFirst({ where: { id: jobId, orgId }, include: { jurisdiction: true, org: true } });
    if (!job) return { ok: false as const, reasons: ["Job not found."] };
    const reasons = publishBlockers({ job, jurisdiction: job.jurisdiction, org: job.org }, now);
    if (reasons.length) {
      await tx.auditEvent.create({
        data: { actorId, action: "job.publish_blocked", entityType: "Job", entityId: jobId, metadata: { reasons } },
      });
      return { ok: false as const, reasons };
    }
    await tx.job.update({ where: { id: jobId }, data: { status: "PUBLISHED", publishedAt: now } });
    await tx.auditEvent.create({
      data: {
        actorId,
        action: "job.published",
        entityType: "Job",
        entityId: jobId,
        metadata: { jurisdictionId: job.jurisdictionId, jurisdictionVersion: job.jurisdiction.version },
      },
    });
    return { ok: true as const };
  });
}

/** Approved, current jurisdiction profiles a job can be filed under. */
export function listJurisdictions() {
  return db().jurisdictionProfile.findMany({
    where: { approved: true, isCurrent: true },
    orderBy: [{ state: "asc" }, { locality: "asc" }],
  });
}

/**
 * Published jobs for a worker. Hidden jobs are returned separately with the
 * worker's own words as the reason — the feed always explains itself.
 */
export async function loadFeed(workerId: string | null, f: FeedFilters = {}) {
  const jobs = await db().job.findMany({
    where: {
      status: "PUBLISHED",
      // Jobs that have already ended aren't open work.
      OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }],
      ...(f.type ? { type: f.type } : {}),
      ...(f.minRateCents ? { payRateCents: { gte: f.minRateCents } } : {}),
      ...(f.startsBefore ? { startsAt: { lte: f.startsBefore } } : {}),
    },
    include: { org: { select: { name: true, approved: true } }, jurisdiction: true },
    orderBy: [{ startsAt: "asc" }, { title: "asc" }],
  });
  const pref = workerId ? effectivePreference(await loadLatestPreference(workerId)) : null;
  const shown: typeof jobs = [];
  const hidden: Array<{ id: string; title: string; reasons: string[] }> = [];
  for (const j of jobs) {
    const reasons = exclusionReasons(pref, { disclosure: readDisclosure(j.campaignDisclosure), orgName: j.org.name, measureIds: j.measureIds });
    if (reasons.length) hidden.push({ id: j.id, title: j.title, reasons });
    else shown.push(j);
  }
  const filtered = f.noCredentials
    ? shown.filter((j) => {
        const r = (j.requirements ?? {}) as Record<string, unknown>;
        const rules = (j.jurisdiction.rules ?? {}) as Record<string, unknown>;
        return !r.badge && !r.registration && !r.affidavit && !r.training &&
          rules.workerRegistrationRequired !== true && rules.badgeRequired !== true && rules.affidavitRequired !== true;
      })
    : shown;
  return { jobs: filtered, hidden };
}
