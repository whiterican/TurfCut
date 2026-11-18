/**
 * The walkbook console (W3), the database half. Everything here is read-only:
 * it reads stops, their newest outcome and who holds each book, and nothing
 * in it writes a row. Org isolation is the job's `orgId`, checked first in
 * every function.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { CONSOLE_MAP_PINS, CONSOLE_PAGE_SIZE, EXPORT_MAX_ROWS, type ConsoleQuery, type ExportRow, type PollColumn } from "@/lib/stop-console";
import { UNVISITED, type OutcomeKind, type StopState } from "@/lib/stop-outcomes";
import { loadCurrentPolls, loadNewestJobAnswers } from "@/lib/poll-data";
import { answerWord } from "@/lib/poll";

const HIRED = ["ACTIVE", "CLAIMED"] as const;
const HISTORY_SHOWN = 50;

/**
 * The job's stops with each one's newest outcome and its book's holder:
 * the FROM clause every query below shares. Newest means latest createdAt,
 * then id, the same order the worker's page uses.
 */
const stopsOf = (jobId: string) => Prisma.sql`
  FROM "public"."WalkbookStop" s
  JOIN "public"."Walkbook" w ON w."id" = s."walkbookId" AND w."jobId" = ${jobId}::uuid
  LEFT JOIN "public"."ImportedAddress" ia ON ia."id" = s."addressId"
  LEFT JOIN LATERAL (
    SELECT o."id", o."outcome"::text AS outcome, o."createdAt"
    FROM "public"."StopOutcome" o WHERE o."stopId" = s."id"
    ORDER BY o."createdAt" DESC, o."id" DESC LIMIT 1
  ) l ON true
  LEFT JOIN LATERAL (
    SELECT a."engagementId" FROM "public"."WalkbookAssignment" a WHERE a."walkbookId" = w."id"
    ORDER BY a."createdAt" DESC, a."id" DESC LIMIT 1
  ) h ON true`;

const where = (q: Pick<ConsoleQuery, "outcome" | "bookId" | "holderId">) => {
  const parts: Prisma.Sql[] = [];
  if (q.outcome === "todo") parts.push(Prisma.sql`l."outcome" IS NULL`);
  else if (q.outcome) parts.push(Prisma.sql`l."outcome" = ${q.outcome}`);
  if (q.bookId) parts.push(Prisma.sql`w."id" = ${q.bookId}::uuid`);
  if (q.holderId === "none") parts.push(Prisma.sql`h."engagementId" IS NULL`);
  else if (q.holderId) parts.push(Prisma.sql`h."engagementId" = ${q.holderId}::uuid`);
  return parts.length ? Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}` : Prisma.empty;
};

export interface ConsoleStop {
  id: string;
  bookId: string;
  bookNumber: number;
  stopNumber: number;
  line1: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  /** The import's names and addresses were deleted (30 days, or sooner): the stop stays, the address fields are empty. */
  purged: boolean;
  result: StopState;
  recordedAt: Date | null;
  holderEngagementId: string | null;
}

type Raw = {
  id: string;
  bookId: string;
  bookNumber: number;
  stopNumber: number;
  line1: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  sourceRecordId?: string | null;
  outcomeId: string | null;
  outcome: OutcomeKind | null;
  recordedAt: Date | null;
  holder: string | null;
};

const SELECT = Prisma.sql`SELECT s."id", w."id" AS "bookId", w."number" AS "bookNumber", s."stopNumber", ia."line1", ia."unit", ia."city", ia."state", ia."zip", ia."lat", ia."lng",
  l."id" AS "outcomeId", l."outcome", l."createdAt" AS "recordedAt", h."engagementId" AS "holder"`;

async function withAnswers(rows: Raw[]): Promise<ConsoleStop[]> {
  const ids = rows.map((r) => r.outcomeId).filter((x): x is string => !!x);
  const answers = ids.length ? await db().stopOutcomeAnswer.findMany({ where: { outcomeId: { in: ids } }, select: { outcomeId: true, key: true, intValue: true, boolValue: true } }) : [];
  const by = new Map<string, StopState["answers"]>();
  for (const a of answers) by.set(a.outcomeId, { ...(by.get(a.outcomeId) ?? {}), [a.key]: a.intValue ?? a.boolValue ?? false });
  return rows.map((r) => ({
    id: r.id,
    bookId: r.bookId,
    bookNumber: r.bookNumber,
    stopNumber: r.stopNumber,
    line1: r.line1 ?? "",
    unit: r.unit,
    city: r.city ?? "",
    state: r.state ?? "",
    zip: r.zip ?? "",
    lat: r.lat,
    lng: r.lng,
    purged: r.line1 === null,
    result: r.outcome ? { outcome: r.outcome, answers: by.get(r.outcomeId!) ?? {} } : UNVISITED,
    recordedAt: r.recordedAt,
    holderEngagementId: r.holder,
  }));
}

/** Names of the people holding books on the job, keyed by engagement id. */
async function holderNames(engagementIds: string[]): Promise<Map<string, { name: string; stillHired: boolean }>> {
  const ids = [...new Set(engagementIds)];
  if (!ids.length) return new Map();
  const es = await db().engagement.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, worker: { select: { displayName: true, closedAt: true } } } });
  return new Map(es.map((e) => [e.id, { name: e.worker.displayName, stillHired: (HIRED as readonly string[]).includes(e.status) && !e.worker.closedAt }]));
}

/**
 * One worker's line. "Holds now" is the books handed to them as things stand;
 * "recorded" is what they themselves recorded, wherever the book is now: a
 * book carries its state to the next holder, so the two are different things
 * and are never merged. Neither is a score (CLAUDE.md rule 5): no total, no
 * percentage, no ranking.
 */
export interface WorkerLine {
  engagementId: string;
  name: string;
  stillHired: boolean;
  /** Books and stops they hold now (0 if none). */
  books: number;
  stops: number;
  /** Stops whose newest outcome they recorded, other than Come back, and the signatures on those. */
  recordedSettled: number;
  recordedSignatures: number;
}

/** Everything the console page shows for one job and one set of filters. */
export async function loadConsole(orgId: string, jobId: string, q: ConsoleQuery) {
  if (!UUID_RE.test(jobId)) return null;
  const job = await db().job.findFirst({ where: { id: jobId, orgId }, select: { id: true, title: true, type: true } });
  if (!job) return null;
  const base = stopsOf(job.id);
  const filter = where(q);

  const [counts, filtered, workerRows, recordedRows, books, pinRows] = await Promise.all([
    // Whole-job counts by outcome, for the filter chips: not narrowed by the filters.
    db().$queryRaw<Array<{ outcome: OutcomeKind | null; n: number }>>`SELECT l."outcome", count(*)::int AS n ${base} GROUP BY l."outcome"`,
    db().$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n ${base} ${filter}`,
    db().$queryRaw<Array<{ engagementId: string; books: number; stops: number }>>`
      SELECT h."engagementId", count(DISTINCT w."id")::int AS books, count(*)::int AS stops
      ${base} WHERE h."engagementId" IS NOT NULL GROUP BY h."engagementId"`,
    // Recorded work by whoever recorded each stop's newest outcome, wherever its book is now.
    db().$queryRaw<Array<{ engagementId: string; settled: number; signatures: number }>>`
      SELECT o."engagementId",
        count(*) FILTER (WHERE o."outcome" <> 'COME_BACK')::int AS settled,
        coalesce(sum((SELECT a."intValue" FROM "public"."StopOutcomeAnswer" a WHERE a."outcomeId" = o."id" AND a."key" = 'signatures')), 0)::int AS signatures
      FROM (
        SELECT DISTINCT ON (x."stopId") x."id", x."engagementId", x."outcome"
        FROM "public"."StopOutcome" x
        JOIN "public"."WalkbookStop" ws ON ws."id" = x."stopId"
        JOIN "public"."Walkbook" ww ON ww."id" = ws."walkbookId" AND ww."jobId" = ${job.id}::uuid
        ORDER BY x."stopId", x."createdAt" DESC, x."id" DESC
      ) o GROUP BY o."engagementId"`,
    db().walkbook.findMany({ where: { jobId: job.id }, orderBy: { number: "asc" }, select: { id: true, number: true, name: true } }),
    db().$queryRaw<Raw[]>`${SELECT} ${base} ${filter} ${q.outcome || q.bookId || q.holderId ? Prisma.sql`AND` : Prisma.sql`WHERE`} ia."lat" IS NOT NULL ORDER BY w."number", s."stopNumber" LIMIT ${CONSOLE_MAP_PINS + 1}`,
  ]);
  const total = filtered[0]?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / CONSOLE_PAGE_SIZE));
  const page = Math.min(q.page, pages);
  const rows = await db().$queryRaw<Raw[]>`${SELECT} ${base} ${filter} ORDER BY w."number", s."stopNumber" LIMIT ${CONSOLE_PAGE_SIZE} OFFSET ${(page - 1) * CONSOLE_PAGE_SIZE}`;

  const [stops, pins] = await Promise.all([withAnswers(rows), withAnswers(pinRows.slice(0, CONSOLE_MAP_PINS))]);
  const names = await holderNames([...workerRows.map((w) => w.engagementId), ...recordedRows.map((r) => r.engagementId), ...stops.map((s) => s.holderEngagementId).filter((x): x is string => !!x)]);
  const byKind = new Map(counts.map((c) => [c.outcome, c.n]));
  const totalStops = counts.reduce((n, c) => n + c.n, 0);
  return {
    job,
    books,
    total,
    totalStops,
    page,
    pages,
    stops,
    pins,
    pinsTruncated: pinRows.length > CONSOLE_MAP_PINS,
    counts: { todo: byKind.get(null) ?? 0, byKind: (kind: OutcomeKind) => byKind.get(kind) ?? 0 },
    holderName: (id: string | null) => (id ? names.get(id)?.name ?? null : null),
    workers: [...new Set([...workerRows.map((w) => w.engagementId), ...recordedRows.map((r) => r.engagementId)])]
      .map((id): WorkerLine => {
        const held = workerRows.find((w) => w.engagementId === id);
        const rec = recordedRows.find((r) => r.engagementId === id);
        return { engagementId: id, name: names.get(id)?.name ?? "Unknown", stillHired: names.get(id)?.stillHired ?? false, books: held?.books ?? 0, stops: held?.stops ?? 0, recordedSettled: rec?.settled ?? 0, recordedSignatures: rec?.signatures ?? 0 };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** One stop's whole history for the inspector: every outcome recorded, newest first. Null when the stop isn't on one of this organization's jobs. */
export async function loadStopHistory(orgId: string, stopId: string, jobId?: string) {
  if (!UUID_RE.test(stopId) || (jobId !== undefined && !UUID_RE.test(jobId))) return null;
  const stop = await db().walkbookStop.findFirst({
    where: { id: stopId, walkbook: { job: { orgId }, ...(jobId ? { jobId } : {}) } },
    select: {
      id: true,
      stopNumber: true,
      walkbook: { select: { id: true, number: true, name: true, jobId: true } },
      // Explicit fields: the file's other columns and its record ID are never read for the inspector. Null once the address is deleted.
      address: { select: { line1: true, unit: true, city: true, state: true, zip: true } },
      outcomes: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: HISTORY_SHOWN + 1,
        select: { id: true, outcome: true, createdAt: true, engagement: { select: { worker: { select: { displayName: true } } } }, answers: { select: { key: true, intValue: true, boolValue: true } } },
      },
    },
  });
  if (!stop) return null;
  return {
    id: stop.id,
    stopNumber: stop.stopNumber,
    book: stop.walkbook,
    address: stop.address,
    historyTruncated: stop.outcomes.length > HISTORY_SHOWN,
    history: stop.outcomes.slice(0, HISTORY_SHOWN).map((o) => ({
      id: o.id,
      outcome: o.outcome as OutcomeKind,
      at: o.createdAt,
      by: o.engagement.worker.displayName,
      answers: Object.fromEntries(o.answers.map((a) => [a.key, a.intValue ?? a.boolValue ?? false])) as StopState["answers"],
    })),
  };
}

/** The rows an export writes: the filtered stops of a job, in book order, up to EXPORT_MAX_ROWS (a bigger job is refused, not cut short). */
export async function loadExportRows(orgId: string, jobId: string, q: Pick<ConsoleQuery, "outcome" | "bookId" | "holderId">, withPoll = false): Promise<{ ok: true; rows: ExportRow[]; pollColumns: PollColumn[] } | { ok: false; reason: string }> {
  if (!UUID_RE.test(jobId)) return { ok: false, reason: "Job not found." };
  const job = await db().job.findFirst({ where: { id: jobId, orgId }, select: { id: true } });
  if (!job) return { ok: false, reason: "Job not found." };
  const base = stopsOf(job.id);
  const filter = where(q);
  const [{ n }] = await db().$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n ${base} ${filter}`;
  if (n > EXPORT_MAX_ROWS) return { ok: false, reason: `That's ${n.toLocaleString("en-US")} stops. Export at most ${EXPORT_MAX_ROWS.toLocaleString("en-US")} at a time: pick a walkbook or an outcome first.` };
  // The source record ID goes out with the export (so a return file can be matched, inside the 30 days) and nowhere else on this page.
  const raw = await db().$queryRaw<Raw[]>`${SELECT}, ia."sourceRecordId" ${base} ${filter} ORDER BY w."number", s."stopNumber"`;
  const stops = await withAnswers(raw);
  const recordIds = new Map(raw.map((r) => [r.id, r.sourceRecordId ?? null]));
  const names = await holderNames(stops.map((s) => s.holderEngagementId).filter((x): x is string => !!x));
  // Poll answers go out only when the caller may read them (full access to the field area) and the job has a poll.
  const questions = withPoll ? ((await loadCurrentPolls([job.id])).get(job.id) ?? []) : [];
  const answers = questions.length ? await loadNewestJobAnswers(orgId, job.id, stops.map((s) => s.id)) : new Map();
  return {
    ok: true,
    pollColumns: questions.map((x) => ({ id: x.id, prompt: x.prompt })),
    rows: stops.map((s) => ({
      poll: questions.length ? Object.fromEntries(questions.map((x) => { const a = answers.get(`${s.id}|${x.id}`); return [x.id, a ? answerWord(x, a) : ""]; })) : undefined,
      bookNumber: s.bookNumber,
      stopNumber: s.stopNumber,
      line1: s.line1,
      unit: s.unit,
      city: s.city,
      state: s.state,
      zip: s.zip,
      sourceRecordId: recordIds.get(s.id) ?? null,
      outcome: s.result.outcome,
      talkedTo: typeof s.result.answers.talked_to === "boolean" ? s.result.answers.talked_to : null,
      leftLiterature: typeof s.result.answers.left_literature === "boolean" ? s.result.answers.left_literature : null,
      signatures: typeof s.result.answers.signatures === "number" ? s.result.answers.signatures : null,
      recordedAt: s.recordedAt,
      holder: s.holderEngagementId ? names.get(s.holderEngagementId)?.name ?? null : null,
    })),
  };
}
