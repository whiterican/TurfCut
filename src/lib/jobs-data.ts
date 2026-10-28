import { Prisma } from "@prisma/client";
import { changeLabels, jobDiff, materialLabels, type JobChanges } from "@/lib/job-changes";
import { notifyJobChanged } from "@/lib/notifications-data";
import { db } from "@/lib/db";
import {
  exclusionReasons,
  jobCredentials,
  openJobsEndAfter,
  publishBlockers,
  readDisclosure,
  UUID_RE,
  type DraftInput,
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
    // Nothing said about the launch leaves it as stored (an API edit from before C4).
    ...(input.launch ? { launch: json(input.launch) } : {}),
    ...(input.tools ? { tools: json(input.tools) } : {}),
  };
}

/**
 * The columns a part-way draft can set: what the builder has so far (P0 3,
 * autosave). A key left out keeps the stored value; the title, type and
 * rule profile are always there (the database needs them).
 */
function draftData(d: DraftInput) {
  const geo = d.city !== undefined || d.state !== undefined ? { ...(d.city ? { city: d.city } : {}), ...(d.state ? { state: d.state } : {}) } : null;
  return {
    type: d.type,
    title: d.title,
    jurisdictionId: d.jurisdictionId,
    ...(d.description !== undefined ? { description: d.description } : {}),
    ...(d.startsAt ? { startsAt: d.startsAt } : {}),
    ...(d.endsAt ? { endsAt: d.endsAt } : {}),
    ...(geo ? { geography: json(geo) } : {}),
    ...(d.compensationMethod ? { compensationMethod: d.compensationMethod } : {}),
    ...(d.payRateCents ? { payRateCents: d.payRateCents } : {}),
    ...(d.headcount ? { headcount: d.headcount } : {}),
    ...(d.hiringModes ? { hiringMethod: json({ modes: d.hiringModes }) } : {}),
    ...(d.requirements ? { requirements: json(d.requirements) } : {}),
    ...(d.disclosure ? { campaignDisclosure: json(d.disclosure) } : {}),
    ...(d.supportContacts ? { supportContacts: json(d.supportContacts) } : {}),
    ...(d.measureIds ? { measureIds: d.measureIds } : {}),
    ...(d.cancellationNoticeHours !== undefined ? { cancellationNoticeHours: d.cancellationNoticeHours } : {}),
    ...(d.launch ? { launch: json(d.launch) } : {}),
    ...(d.tools ? { tools: json(d.tools) } : {}),
  };
}

/**
 * Saves the builder's progress as a draft (P0 3): creates one on the first
 * save, then updates it under the job's lock while it stays a draft. Only
 * what changed is written, with one `job.draft_autosaved` audit event naming
 * the parts; nothing is written when nothing changed. A published or paused
 * job is never touched this way (null: the builder stops saving as it goes),
 * so a live job only ever changes through updatePublishedJob's record.
 */
export async function saveDraftProgress(orgId: string, actorId: string, jobId: string | null, draft: DraftInput, newId?: string): Promise<{ id: string; created: boolean; changed: string[] } | null> {
  const data = draftData(draft);
  if (!jobId) {
    return db().$transaction(async (tx) => {
      // `newId`: the builder's own id for the draft, so a lost answer doesn't lead to a second draft (the action checks it first).
      const job = await tx.job.create({ data: { ...(newId ? { id: newId } : {}), ...data, orgId, status: "DRAFT" }, select: { id: true } });
      await tx.auditEvent.create({ data: { actorId, action: "job.created", entityType: "Job", entityId: job.id, metadata: { status: "DRAFT", autosaved: true } } });
      return { id: job.id, created: true, changed: changeLabels(jobDiff({}, data)) };
    });
  }
  if (!UUID_RE.test(jobId)) return null;
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`job:${jobId}`}))`;
    const stored = await tx.job.findFirst({ where: { id: jobId, orgId, status: "DRAFT" } });
    if (!stored) return null;
    // As keepUnsetLaunch: the builder's default launch (staged, no points yet) means "as it was" for a pre-C4 draft.
    const next: Partial<typeof data> = { ...data };
    if (stored.launch === null && draft.launch?.mode === "STAGED" && draft.launch.points.length === 0) delete next.launch;
    const changes = jobDiff(stored, next);
    const changed = changeLabels(changes);
    if (!changed.length) return { id: jobId, created: false, changed };
    const { count } = await tx.job.updateMany({ where: { id: jobId, orgId, status: "DRAFT" }, data: next });
    if (count === 0) return null;
    await tx.auditEvent.create({ data: { actorId, action: "job.draft_autosaved", entityType: "Job", entityId: jobId, metadata: { changed } } });
    return { id: jobId, created: false, changed };
  });
}

/**
 * A job from before C4 says nothing about its launch (staging is set per
 * shift). The builder always sends a mode, and its default — staged with no
 * points yet — means "as it was" for such a job: the stored null stays, so
 * nothing is recorded and no release opens over a typo fix on a live job,
 * and a draft still publishes as before. Picking self-launch or adding a
 * point is a real change to how the day starts.
 */
function keepUnsetLaunch<T extends { launch?: unknown }>(stored: unknown, input: JobInput, data: T): T {
  if (stored === null && input.launch?.mode === "STAGED" && input.launch.points.length === 0) delete data.launch;
  return data;
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

/**
 * Edits a job while it is still a draft. Returns false if it isn't. Takes
 * the publish lock, so an edit can't land between the publish gate's check
 * and the status change.
 */
export async function updateDraftJob(jobId: string, orgId: string, actorId: string, input: JobInput) {
  if (!UUID_RE.test(jobId)) return false;
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`job:${jobId}`}))`;
    const stored = await tx.job.findFirst({ where: { id: jobId, orgId, status: "DRAFT" }, select: { launch: true } });
    if (!stored) return false;
    const { count } = await tx.job.updateMany({ where: { id: jobId, orgId, status: "DRAFT" }, data: keepUnsetLaunch(stored.launch, input, jobData(input)) });
    if (count === 0) return false;
    await tx.auditEvent.create({ data: { actorId, action: "job.edited", entityType: "Job", entityId: jobId } });
    return true;
  });
}

/**
 * Edits a published (or paused) job (C4.3). The job has to stay
 * publishable, so the edit is refused with the gate's reasons otherwise.
 * What changed is recorded as a JobChange; everyone engaged on the job is
 * told, and for a material change hired workers may leave within
 * RELEASE_HOURS with no penalty (job-changes-data.ts). Under the job's
 * lock, like publishing.
 */
export async function updatePublishedJob(
  jobId: string,
  orgId: string,
  actorId: string,
  input: JobInput,
  now = new Date()
): Promise<{ ok: true; changed: string[]; material: string[]; told: number } | { ok: false; reasons: string[] }> {
  if (!UUID_RE.test(jobId)) return { ok: false, reasons: ["Job not found."] };
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`job:${jobId}`}))`;
    const job = await tx.job.findFirst({ where: { id: jobId, orgId }, include: { jurisdiction: true, org: true } });
    if (!job) return { ok: false as const, reasons: ["Job not found."] };
    if (job.status !== "PUBLISHED" && job.status !== "PAUSED") return { ok: false as const, reasons: ["Only a published or paused job is edited this way."] };
    const data = keepUnsetLaunch(job.launch, input, jobData(input));
    const jurisdiction = data.jurisdictionId === job.jurisdictionId ? job.jurisdiction : await tx.jurisdictionProfile.findUnique({ where: { id: data.jurisdictionId } });
    // Judged as a draft would be: the question is whether the edited job could publish, not whether it is.
    const reasons = publishBlockers({ job: { ...job, ...data, status: "DRAFT" }, jurisdiction, org: job.org }, now);
    if (reasons.length) return { ok: false as const, reasons: ["A live job has to pass the publishing checks, and with this saved it wouldn't: " + reasons.join(" ")] };
    const changes = jobDiff(job, data);
    const changed = changeLabels(changes);
    if (!changed.length) return { ok: true as const, changed, material: [], told: 0 };
    const material = materialLabels(changes);
    await tx.job.update({ where: { id: jobId }, data });
    const change = await tx.jobChange.create({ data: { jobId, actorId, changes: json(changes), material, createdAt: now }, select: { id: true } });
    await tx.auditEvent.create({
      data: { actorId, action: "job.changed", entityType: "Job", entityId: jobId, metadata: { changeId: change.id, changed, material, jurisdictionId: data.jurisdictionId, jurisdictionVersion: jurisdiction?.version ?? null }, createdAt: now },
    });
    const told = await notifyJobChanged(tx, jobId, actorId, now);
    return { ok: true as const, changed, material, told };
  });
}

/** A job's edits since it was published, newest first, with who made each (C4.3). */
export async function loadJobChanges(jobId: string) {
  const rows = await db().jobChange.findMany({ where: { jobId }, orderBy: { createdAt: "desc" }, select: { id: true, actorId: true, changes: true, material: true, createdAt: true } });
  const actors = new Map((await db().profile.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorId))] } }, select: { id: true, displayName: true } })).map((p) => [p.id, p.displayName]));
  return rows.map((r) => ({ ...r, changes: r.changes as JobChanges, by: actors.get(r.actorId) ?? null, labels: changeLabels(r.changes as JobChanges) }));
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
      OR: [{ endsAt: null }, { endsAt: { gt: openJobsEndAfter(new Date()) } }],
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
  // The same list the job card shows, so "No credentials" means exactly that.
  const filtered = f.noCredentials
    ? shown.filter((j) => jobCredentials({ type: j.type, requirements: j.requirements, jurisdictionRules: j.jurisdiction.rules }).length === 0)
    : shown;
  return { jobs: filtered, hidden };
}
