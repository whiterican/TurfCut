/**
 * The walkbooks a worker holds now: what a worker's phone is served. Its own
 * file, on the isolation test's guarded list, so it can never read an
 * imported row's stored columns or name the import tables: a stop's address is
 * read through STOP_SELECT's explicit fields and nothing else.
 */
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { loadCurrentPolls, loadWorkerPollAnswers, loadWorkerPollLocks } from "@/lib/poll-data";
import { loadStopRecorders, loadStopStates } from "@/lib/stop-outcomes-data";
import { UNVISITED, type StopState } from "@/lib/stop-outcomes";
import { flat, HIRED, holders, STOP_SELECT } from "@/lib/walkbook-shared";

type WorkerAnswerView = { questionId: string; choiceId: string | null; declined: boolean };

/** The ids of the walkbooks a worker holds now, on jobs they're still hired on, each with the engagement that holds it. */
async function heldBooks(workerId: string, jobId?: string): Promise<Map<string, string>> {
  if (jobId && !UUID_RE.test(jobId)) return new Map();
  const mine = await db().engagement.findMany({
    where: { workerId, status: { in: [...HIRED] }, worker: { closedAt: null }, ...(jobId ? { jobId } : {}) },
    select: { id: true },
  });
  if (!mine.length) return new Map();
  const mineIds = new Set(mine.map((e) => e.id));
  // Books ever handed to one of these engagements; then keep those whose newest row is still theirs.
  const touched = await db().walkbookAssignment.findMany({ where: { engagementId: { in: [...mineIds] } }, distinct: ["walkbookId"], select: { walkbookId: true } });
  const held = await holders(touched.map((t) => t.walkbookId));
  return new Map([...held.entries()].flatMap(([id, h]) => (h.engagementId && mineIds.has(h.engagementId) ? [[id, h.engagementId] as [string, string]] : [])));
}

/**
 * The names and stop counts of the walkbooks a worker holds now: what the shift page lists. No stop, no
 * address and no poll answer is read for it (that page is saved for offline use; the stops live on /walkbooks).
 */
export async function loadWorkerWalkbookList(workerId: string, jobId?: string) {
  const ids = [...(await heldBooks(workerId, jobId)).keys()];
  if (!ids.length) return [];
  const books = await db().walkbook.findMany({ where: { id: { in: ids } }, orderBy: [{ jobId: "asc" }, { number: "asc" }], select: { id: true, name: true, _count: { select: { stops: true } } } });
  return books.map((b) => ({ id: b.id, name: b.name, stops: b._count.stops }));
}

/**
 * The walkbooks a worker holds now, on jobs they're still hired on, with
 * their stops. A book handed to someone else, or taken back, is no longer
 * theirs to see.
 */
export async function loadWorkerWalkbooks(workerId: string, jobId?: string) {
  const heldBy = await heldBooks(workerId, jobId);
  const ids = [...heldBy.keys()];
  if (!ids.length) return [];
  const books = await db().walkbook.findMany({
    where: { id: { in: ids } },
    orderBy: [{ jobId: "asc" }, { number: "asc" }],
    select: { id: true, number: true, name: true, job: { select: { id: true, title: true, type: true } }, stops: { orderBy: { stopNumber: "asc" }, select: STOP_SELECT } },
  });
  // A book carries its state with it: what the last holder recorded is what the next one sees.
  const states = await loadStopStates(books.flatMap((b) => b.stops.map((s) => s.id)));
  // The job's poll, and what this worker themselves recorded at each stop (never anyone else's rows).
  const polls = await loadCurrentPolls(books.map((b) => b.job.id));
  const polled = polls.size ? books.filter((b) => polls.has(b.job.id)).flatMap((b) => b.stops.map((s) => s.id)) : [];
  const answers = polled.length ? await loadWorkerPollAnswers(workerId, polled) : new Map<string, WorkerAnswerView[]>();
  // The poll is the worker's to ask only at a door they recorded as Done themselves, and a question whose answer now
  // is someone else's (an earlier holder's, or staff's) is left out of their form: recording refuses both, so the page
  // must not offer them, nor show the worker's own older answer as if it were the answer now.
  const holderByStop = new Map(books.filter((b) => polls.has(b.job.id)).flatMap((b) => b.stops.map((s) => [s.id, heldBy.get(b.id)!] as [string, string])));
  const [recorders, locks] = polled.length ? await Promise.all([loadStopRecorders(polled), loadWorkerPollLocks(holderByStop)]) : [new Map<string, string>(), new Set<string>()];
  return books.map((b) => ({
    ...b,
    poll: polls.get(b.job.id) ?? [],
    stops: b.stops.map((s) => {
      const result = states.get(s.id) ?? (UNVISITED as StopState);
      const pollMine = result.outcome === "DONE" && recorders.get(s.id) === heldBy.get(b.id);
      // Nothing about a door's poll goes to the phone until the door is theirs: not their own answers, and not which questions someone else answered.
      return {
        id: s.id,
        stopNumber: s.stopNumber,
        ...flat(s.address),
        result,
        poll: pollMine ? (answers.get(s.id) ?? ([] as WorkerAnswerView[])).filter((a) => !locks.has(`${s.id}|${a.questionId}`)) : ([] as WorkerAnswerView[]),
        pollMine,
        pollLocked: pollMine ? (polls.get(b.job.id) ?? []).filter((q) => locks.has(`${s.id}|${q.id}`)).map((q) => q.id) : [],
      };
    }),
  }));
}
