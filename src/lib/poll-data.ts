/**
 * Polling at the door (W5), the database half.
 *
 * Questions are set up by the organization on a canvass job and are
 * append-only: changing one adds a new question that supersedes it. Answers
 * are recorded by the worker holding the walkbook, on a stop whose newest
 * outcome is Done, and edited the same way: every edit is a new row, the
 * newest row of a stop and question is the answer now, and every earlier
 * answer stays with who gave it and when (rule 3).
 *
 * Who reads what is decided by the callers (the server actions and pages);
 * this file only offers the two views: the staff view (everything on the
 * organization's job) and the worker view (only the rows the worker's own
 * engagements recorded). Recording takes the per-walkbook advisory lock that
 * handing a book out and recording an outcome take, so a take-back and a tap
 * can't both win.
 */
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { newestAnswers, POLL_MAX_QUESTIONS, readAnswers, tally, validateQuestion, type PollQuestionView, type Tally } from "@/lib/poll";

type Tx = Prisma.TransactionClient;
type Fail = { ok: false; reason: string; errors?: Record<string, string>; /** The stop isn't this worker's to record on: nothing to retry. */ gone?: true };
export type Staff = { profileId: string; orgId: string };
export type WorkerActor = { workerId: string; profileId: string };

const lock = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
const HIRED = ["ACTIVE", "CLAIMED"] as const;
const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();

// ---------------------------------------------------------------------------
// Setting up a poll (the organization's job editors)
// ---------------------------------------------------------------------------

/** The job's questions as the form shows them: current ones, in order, with their choices. */
async function currentQuestions(tx: Tx | ReturnType<typeof db>, jobId: string): Promise<PollQuestionView[]> {
  const qs = await tx.pollQuestion.findMany({
    where: { jobId, supersededBy: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, position: true, prompt: true, choices: { orderBy: { position: "asc" }, select: { id: true, label: true } } },
  });
  return qs;
}

async function ownedPollJob(tx: Tx, actor: Staff, jobIdRaw: string) {
  const jobId = lower(jobIdRaw);
  if (!UUID_RE.test(jobId)) return null;
  return tx.job.findFirst({ where: { id: jobId, orgId: actor.orgId }, select: { id: true, type: true } });
}

/** Adds a question to a canvass job's poll, at the next free position. */
export async function addPollQuestion(actor: Staff, jobIdRaw: string, raw: Record<string, unknown>, now = new Date()): Promise<{ ok: true; questionId: string; jobId: string } | Fail> {
  const v = validateQuestion(raw);
  if (!v.ok) return { ok: false, reason: "Fix the highlighted fields.", errors: v.errors };
  return db().$transaction(async (tx) => {
    const job = await ownedPollJob(tx, actor, jobIdRaw);
    if (!job) return { ok: false as const, reason: "Job not found." };
    if (job.type !== "CANVASS") return { ok: false as const, reason: "Polls are for door-to-door canvassing jobs." };
    await lock(tx, `poll:${job.id}`);
    const current = await currentQuestions(tx, job.id);
    if (current.length >= POLL_MAX_QUESTIONS) return { ok: false as const, reason: `A poll has at most ${POLL_MAX_QUESTIONS} questions.` };
    const taken = new Set(current.map((q) => q.position));
    const position = Array.from({ length: POLL_MAX_QUESTIONS }, (_, i) => i + 1).find((p) => !taken.has(p))!;
    const id = randomUUID();
    await tx.pollQuestion.create({ data: { id, jobId: job.id, position, prompt: v.value.prompt, createdById: actor.profileId, createdAt: now, choices: { create: v.value.choices.map((label, i) => ({ id: randomUUID(), position: i + 1, label })) } } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "poll.question_added", entityType: "PollQuestion", entityId: id, metadata: { jobId: job.id, position, choices: v.value.choices.length }, createdAt: now } });
    return { ok: true as const, questionId: id, jobId: job.id };
  });
}

/**
 * Changes a question: a new one, at the same position, that supersedes the old.
 * The old question and every answer given to it stay, as history; new answers
 * go to the new one.
 */
export async function changePollQuestion(actor: Staff, questionIdRaw: string, raw: Record<string, unknown>, now = new Date()): Promise<{ ok: true; questionId: string; jobId: string } | Fail> {
  const oldId = lower(questionIdRaw);
  if (!UUID_RE.test(oldId)) return { ok: false, reason: "Question not found." };
  const v = validateQuestion(raw);
  if (!v.ok) return { ok: false, reason: "Fix the highlighted fields.", errors: v.errors };
  try {
    return await db().$transaction(async (tx) => {
      const old = await tx.pollQuestion.findFirst({ where: { id: oldId, job: { orgId: actor.orgId } }, select: { id: true, jobId: true, position: true, supersededBy: { select: { id: true } } } });
      if (!old) return { ok: false as const, reason: "Question not found." };
      await lock(tx, `poll:${old.jobId}`);
      const again = await tx.pollQuestion.findUnique({ where: { id: old.id }, select: { supersededBy: { select: { id: true } } } });
      if (again?.supersededBy) return { ok: false as const, reason: "This question was already changed. Reload to see the current one." };
      const id = randomUUID();
      await tx.pollQuestion.create({ data: { id, jobId: old.jobId, position: old.position, prompt: v.value.prompt, supersedesId: old.id, createdById: actor.profileId, createdAt: now, choices: { create: v.value.choices.map((label, i) => ({ id: randomUUID(), position: i + 1, label })) } } });
      await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "poll.question_changed", entityType: "PollQuestion", entityId: id, metadata: { jobId: old.jobId, supersedes: old.id, position: old.position }, createdAt: now } });
      return { ok: true as const, questionId: id, jobId: old.jobId };
    });
  } catch (e) {
    // The unique index on supersedesId: two changes at once, one wins.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, reason: "This question was already changed. Reload to see the current one." };
    throw e;
  }
}

/** The current questions of each job, for the worker's form. */
export async function loadCurrentPolls(jobIds: string[]): Promise<Map<string, PollQuestionView[]>> {
  const ids = [...new Set(jobIds)];
  if (!ids.length) return new Map();
  const qs = await db().pollQuestion.findMany({
    where: { jobId: { in: ids }, supersededBy: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, jobId: true, position: true, prompt: true, choices: { orderBy: { position: "asc" }, select: { id: true, label: true } } },
  });
  const by = new Map<string, PollQuestionView[]>();
  for (const { jobId, ...q } of qs) by.set(jobId, [...(by.get(jobId) ?? []), q]);
  return by;
}

export interface PollSetup {
  jobId: string;
  current: PollQuestionView[];
  /** Earlier versions of changed questions, with the question each was replaced by. */
  earlier: Array<PollQuestionView & { replacedBy: string }>;
}

/** A job's poll for its organization: the current questions and the earlier wording. Null when the job isn't theirs. */
export async function loadPollSetup(orgId: string, jobIdRaw: string): Promise<PollSetup | null> {
  const jobId = lower(jobIdRaw);
  if (!UUID_RE.test(jobId)) return null;
  const job = await db().job.findFirst({ where: { id: jobId, orgId }, select: { id: true } });
  if (!job) return null;
  const all = await db().pollQuestion.findMany({
    where: { jobId: job.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, position: true, prompt: true, supersededBy: { select: { id: true } }, choices: { orderBy: { position: "asc" }, select: { id: true, label: true } } },
  });
  return {
    jobId: job.id,
    current: all.filter((q) => !q.supersededBy).map((q) => ({ id: q.id, position: q.position, prompt: q.prompt, choices: q.choices })),
    earlier: all.filter((q) => q.supersededBy).map(({ supersededBy, ...q }) => ({ ...q, replacedBy: supersededBy!.id })),
  };
}

// ---------------------------------------------------------------------------
// Recording and editing answers
// ---------------------------------------------------------------------------

/** One row's id from the device's id and the question: a double tap or a retry records once. */
function rowId(clientId: string, questionId: string): string {
  const h = createHash("sha256").update(`${clientId}:${questionId}`).digest("hex");
  const v = (parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v.toString(16).padStart(2, "0")}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

type Who = { kind: "WORKER"; workerId: string; profileId: string } | { kind: "STAFF"; profileId: string; orgId: string };

async function record(who: Who, stopIdRaw: unknown, clientIdRaw: unknown, raw: Record<string, unknown>, now: Date): Promise<{ ok: true; jobId: string; saved: number; repeated: boolean } | Fail> {
  const stopId = lower(stopIdRaw);
  const clientId = lower(clientIdRaw);
  if (!UUID_RE.test(stopId)) return { ok: false, reason: "Stop not found.", gone: who.kind === "WORKER" ? true : undefined };
  if (who.kind === "WORKER" && !UUID_RE.test(clientId)) return { ok: false, reason: "Something went wrong with that tap. Try again." };
  try {
    return await db().$transaction(async (tx) => {
      const gone = { ok: false as const, reason: "Stop not found.", ...(who.kind === "WORKER" ? { gone: true as const } : {}) };
      const stop = await tx.walkbookStop.findUnique({ where: { id: stopId }, select: { id: true, walkbookId: true, walkbook: { select: { jobId: true, job: { select: { orgId: true, type: true } } } } } });
      if (!stop) return gone;
      await lock(tx, `walkbook:${stop.walkbookId}`);
      let engagementId: string | null = null;
      if (who.kind === "WORKER") {
        const held = await tx.walkbookAssignment.findFirst({ where: { walkbookId: stop.walkbookId }, orderBy: { createdAt: "desc" }, select: { engagementId: true } });
        const e = held?.engagementId ? await tx.engagement.findFirst({ where: { id: held.engagementId, workerId: who.workerId, status: { in: [...HIRED] }, worker: { closedAt: null } }, select: { id: true } }) : null;
        if (!e) return gone;
        engagementId = e.id;
      } else if (stop.walkbook.job.orgId !== who.orgId) return gone;

      const questions = await currentQuestions(tx, stop.walkbook.jobId);
      if (!questions.length) return { ok: false as const, reason: "This job has no poll." };
      // The poll is asked at a door that was reached.
      // For a worker, a Done they recorded themselves: a hand-on carries a stop's state to the next holder, but not the visit.
      const outcome = await tx.stopOutcome.findFirst({ where: { stopId: stop.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { outcome: true, engagementId: true } });
      if (outcome?.outcome !== "DONE" || (who.kind === "WORKER" && outcome.engagementId !== engagementId)) return { ok: false as const, reason: "Record this door as Done before its poll." };
      const read = readAnswers(raw, questions);
      if (!read.ok) return { ok: false as const, reason: read.reason };

      // A replay: every row of this tap is already there.
      const ids = read.value.map((a) => rowId(clientId || randomUUID(), a.questionId));
      if (who.kind === "WORKER") {
        const existing = await tx.pollAnswer.findMany({ where: { id: { in: ids } }, select: { id: true, stopId: true, engagementId: true } });
        if (existing.some((r) => r.stopId !== stop.id || r.engagementId !== engagementId)) return { ok: false as const, reason: "Something went wrong with that tap. Try again." };
        // Any row of this tap already there means it was saved (unchanged answers add none, so a retry may find only some).
        if (existing.length > 0) return { ok: true as const, jobId: stop.walkbook.jobId, saved: 0, repeated: true };
      }
      // Only what changed is a new row: saving an unchanged form adds nothing to the history.
      const newest = newestAnswers(await tx.pollAnswer.findMany({ where: { stopId: stop.id, questionId: { in: read.value.map((a) => a.questionId) } }, select: { stopId: true, questionId: true, choiceId: true, declined: true, createdAt: true, engagementId: true } }));
      // A worker reads back only their own rows, so they change only those: an answer someone else recorded isn't theirs to overwrite blind or to probe. Staff change it.
      if (who.kind === "WORKER" && read.value.some((a) => { const cur = newest.get(`${stop.id}|${a.questionId}`); return cur && cur.engagementId !== engagementId; })) {
        return { ok: false as const, reason: "An answer here was recorded by someone else. Ask a supervisor to change it." };
      }
      let saved = 0;
      for (const a of read.value) {
        const cur = newest.get(`${stop.id}|${a.questionId}`);
        if (cur && cur.choiceId === a.choiceId && cur.declined === (a.choiceId === null)) continue;
        // Strictly after the stop and question's newest row, so "newest wins" never ties.
        const at = cur && cur.createdAt >= now ? new Date(cur.createdAt.getTime() + 1) : now;
        const id = who.kind === "WORKER" ? rowId(clientId, a.questionId) : randomUUID();
        await tx.pollAnswer.create({ data: { id, stopId: stop.id, questionId: a.questionId, choiceId: a.choiceId, declined: a.choiceId === null, engagementId, recordedById: who.profileId, createdAt: at } });
        saved++;
      }
      return { ok: true as const, jobId: stop.walkbook.jobId, saved, repeated: false };
    });
  } catch (e) {
    // The primary key: a device id reused on another book by a racing request.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, reason: "Something went wrong with that tap. Try again." };
    throw e;
  }
}

/** The worker holding a walkbook records or edits a poll at a Done stop. */
export const recordPollAnswers = (actor: WorkerActor, stopId: unknown, clientId: unknown, raw: Record<string, unknown>, now = new Date()) => record({ kind: "WORKER", ...actor }, stopId, clientId, raw, now);

/** Staff with full access to the field area edit a stop's poll answers (engagement left empty). */
export const staffRecordPollAnswers = (actor: Staff, stopId: unknown, raw: Record<string, unknown>, now = new Date()) => record({ kind: "STAFF", ...actor }, stopId, randomUUID(), raw, now);

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface WorkerAnswer {
  questionId: string;
  choiceId: string | null;
  declined: boolean;
}

/**
 * What a worker may read back: the newest row each of their own engagements
 * recorded, per stop and question. Rows another worker or staff recorded are
 * not theirs to read, even on a stop of a book they hold now.
 */
export async function loadWorkerPollAnswers(workerId: string, stopIds: string[]): Promise<Map<string, WorkerAnswer[]>> {
  if (!stopIds.length) return new Map();
  const rows = await db().pollAnswer.findMany({
    where: { stopId: { in: stopIds }, engagement: { workerId, status: { in: [...HIRED] }, worker: { closedAt: null } } },
    select: { stopId: true, questionId: true, choiceId: true, declined: true, createdAt: true },
  });
  const out = new Map<string, WorkerAnswer[]>();
  for (const r of newestAnswers(rows).values()) out.set(r.stopId, [...(out.get(r.stopId) ?? []), { questionId: r.questionId, choiceId: r.choiceId, declined: r.declined }]);
  return out;
}

export interface PollHistoryEntry {
  id: string;
  questionId: string;
  choiceId: string | null;
  declined: boolean;
  at: Date;
  /** The worker's name, or "Staff" for an edit by staff. */
  by: string;
}

/** A stop's whole poll history for staff: every answer row, newest first, for every version of the questions. Null when the stop isn't on this organization's job. */
export async function loadStopPollHistory(orgId: string, stopIdRaw: string, jobId: string) {
  const stopId = lower(stopIdRaw);
  if (!UUID_RE.test(stopId) || !UUID_RE.test(lower(jobId))) return null;
  const stop = await db().walkbookStop.findFirst({ where: { id: stopId, walkbook: { jobId: lower(jobId), job: { orgId } } }, select: { id: true } });
  if (!stop) return null;
  const rows = await db().pollAnswer.findMany({
    where: { stopId: stop.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
    select: { id: true, questionId: true, choiceId: true, declined: true, createdAt: true, engagement: { select: { worker: { select: { displayName: true } } } } },
  });
  const questions = await db().pollQuestion.findMany({
    where: { jobId: lower(jobId) },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, position: true, prompt: true, supersededBy: { select: { id: true } }, choices: { orderBy: { position: "asc" }, select: { id: true, label: true } } },
  });
  return {
    questions: questions.map(({ supersededBy, ...q }) => ({ ...q, current: !supersededBy })),
    history: rows.map((r): PollHistoryEntry => ({ id: r.id, questionId: r.questionId, choiceId: r.choiceId, declined: r.declined, at: r.createdAt, by: r.engagement?.worker.displayName ?? "Staff" })),
  };
}

/** Counts of the newest answers per question, for each question of the job and its earlier versions. The newest answer of a stop and question counts once. */
export async function loadPollResults(orgId: string, jobIdRaw: string): Promise<{ current: Tally[]; earlier: Tally[] } | null> {
  const jobId = lower(jobIdRaw);
  if (!UUID_RE.test(jobId)) return null;
  const setup = await loadPollSetup(orgId, jobId);
  if (!setup) return null;
  const rows = await db().$queryRaw<Array<{ questionId: string; choiceId: string | null; declined: boolean }>>`
    SELECT n."questionId", n."choiceId", n."declined" FROM (
      SELECT DISTINCT ON (a."stopId", a."questionId") a."questionId", a."choiceId", a."declined"
      FROM "public"."PollAnswer" a
      JOIN "public"."WalkbookStop" s ON s."id" = a."stopId"
      JOIN "public"."Walkbook" w ON w."id" = s."walkbookId" AND w."jobId" = ${jobId}::uuid
      ORDER BY a."stopId", a."questionId", a."createdAt" DESC, a."id" DESC
    ) n`;
  return { current: tally(setup.current, rows), earlier: tally(setup.earlier, rows) };
}

/** The newest answer of each stop and question across a job, for the export. Keyed "stopId|questionId". */
export async function loadNewestJobAnswers(orgId: string, jobIdRaw: string, stopIds: string[]): Promise<Map<string, { questionId: string; choiceId: string | null; declined: boolean }>> {
  const jobId = lower(jobIdRaw);
  // Scoped to the organization's own job and to the stops asked for (the export's rows), never a whole job on a bare id.
  if (!UUID_RE.test(jobId) || !stopIds.length || !(await db().job.findFirst({ where: { id: jobId, orgId }, select: { id: true } }))) return new Map();
  const rows = await db().$queryRaw<Array<{ stopId: string; questionId: string; choiceId: string | null; declined: boolean }>>`
    SELECT DISTINCT ON (a."stopId", a."questionId") a."stopId", a."questionId", a."choiceId", a."declined"
    FROM "public"."PollAnswer" a
    JOIN "public"."WalkbookStop" s ON s."id" = a."stopId"
    JOIN "public"."Walkbook" w ON w."id" = s."walkbookId" AND w."jobId" = ${jobId}::uuid
    WHERE a."stopId" = ANY(${stopIds}::uuid[])
    ORDER BY a."stopId", a."questionId", a."createdAt" DESC, a."id" DESC`;
  return new Map(rows.map((r) => [`${r.stopId}|${r.questionId}`, r]));
}

/**
 * Records that staff read poll answers (a stop's history, or the job's
 * results): who, which job, and what kind of read; never the answers. Poll
 * answers are the most sensitive thing the app holds about residents, so a
 * read leaves a trace like an export does.
 */
export async function auditPollRead(actor: Staff, jobId: string, kind: "stop_history" | "results", stopId?: string): Promise<void> {
  await db().auditEvent.create({ data: { actorId: actor.profileId, action: "poll.answers_read", entityType: "Job", entityId: jobId, metadata: { kind, ...(stopId ? { stopId } : {}) } } });
}
