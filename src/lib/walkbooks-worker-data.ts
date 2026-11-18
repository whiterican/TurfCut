/**
 * The walkbooks a worker holds now: what a worker's phone is served. Its own
 * file, on the isolation test's guarded list, so it can never read an
 * imported row's stored columns or name the import tables: a stop's address is
 * read through STOP_SELECT's explicit fields and nothing else.
 */
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { loadCurrentPolls, loadWorkerPollAnswers } from "@/lib/poll-data";
import { loadStopStates } from "@/lib/stop-outcomes-data";
import { UNVISITED, type StopState } from "@/lib/stop-outcomes";
import { flat, HIRED, holders, STOP_SELECT } from "@/lib/walkbook-shared";

type WorkerAnswerView = { questionId: string; choiceId: string | null; declined: boolean };

/**
 * The walkbooks a worker holds now, on jobs they're still hired on, with
 * their stops. A book handed to someone else, or taken back, is no longer
 * theirs to see.
 */
export async function loadWorkerWalkbooks(workerId: string, jobId?: string) {
  if (jobId && !UUID_RE.test(jobId)) return [];
  const mine = await db().engagement.findMany({
    where: { workerId, status: { in: [...HIRED] }, worker: { closedAt: null }, ...(jobId ? { jobId } : {}) },
    select: { id: true },
  });
  if (!mine.length) return [];
  const mineIds = new Set(mine.map((e) => e.id));
  // Books ever handed to one of these engagements; then keep those whose newest row is still theirs.
  const touched = await db().walkbookAssignment.findMany({ where: { engagementId: { in: [...mineIds] } }, distinct: ["walkbookId"], select: { walkbookId: true } });
  const held = await holders(touched.map((t) => t.walkbookId));
  const ids = [...held.entries()].filter(([, h]) => h.engagementId && mineIds.has(h.engagementId)).map(([id]) => id);
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
  const answers = polls.size ? await loadWorkerPollAnswers(workerId, books.flatMap((b) => b.stops.map((s) => s.id))) : new Map<string, never[]>();
  return books.map((b) => ({
    ...b,
    poll: polls.get(b.job.id) ?? [],
    stops: b.stops.map((s) => ({ id: s.id, stopNumber: s.stopNumber, ...flat(s.address), result: states.get(s.id) ?? UNVISITED as StopState, poll: answers.get(s.id) ?? ([] as WorkerAnswerView[]) })),
  }));
}
