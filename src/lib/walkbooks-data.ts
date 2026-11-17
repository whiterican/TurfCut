/**
 * File-to-walkbook (W1), the database half. Staff bring an authorized file
 * (addresses only are kept: src/lib/walkbooks.ts), cut its addresses into
 * numbered walkbooks on a job, and hand each book to a worker hired on that
 * job. Who holds a book is append-only history (WalkbookAssignment): a new
 * row each time it changes hands or is taken back; the newest row is who
 * holds it now.
 *
 * Lock order: the job's walkbooks (cutting), then a walkbook (assigning).
 * Locks are keyed on ids as the database returns them (lower case), never
 * as they arrived, so "ABC…" and "abc…" can't take two different locks.
 *
 * Callers own authorization: `Staff` is trusted as given. The server actions
 * (src/app/jobs/[jobId]/walkbooks/actions.ts) build it from requireArea("field").
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canScheduleShift, UUID_RE } from "@/lib/jobs";
import { loadJobProgress, loadStopStates } from "@/lib/stop-outcomes-data";
import { UNVISITED, type StopState } from "@/lib/stop-outcomes";
import { cutBooks, readAddressFile, readStopsPerBook, validateImportMeta, walkOrder } from "@/lib/walkbooks";

type Tx = Prisma.TransactionClient;
type Fail = { ok: false; reason: string; errors?: Record<string, string> };
export type Staff = { profileId: string; orgId: string };

const lock = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
/** Confirmed workers: hired on the job (accepted offer or instant claim). */
const HIRED = ["ACTIVE", "CLAIMED"] as const;
/** Walkbook.number's ceiling in the database (Walkbook_number). */
const MAX_BOOK_NUMBER = 100_000;
/** Imports listed on a job's walkbook page. */
const IMPORTS_SHOWN = 50;

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Stores an authorized file's addresses (and only its addresses) for the
 * organization. `meta` is what the uploader states: where the file came
 * from, what it is for, its license, and that they are authorized to use it.
 */
export async function importAddresses(actor: Staff, meta: Record<string, unknown>, text: string, now = new Date()): Promise<{ ok: true; importId: string; kept: number; skipped: number } | Fail> {
  const m = validateImportMeta(meta);
  if (!m.ok) return { ok: false, reason: "Fix the highlighted fields.", errors: m.errors };
  const read = readAddressFile(text);
  if (!read.ok) return { ok: false, reason: read.reason, errors: { file: read.reason } };
  const { file } = read;
  return db().$transaction(
    async (tx) => {
      const imp = await tx.addressImport.create({
        data: {
          orgId: actor.orgId,
          uploadedById: actor.profileId,
          ...m.value,
          rowCount: file.rowCount,
          keptCount: file.rows.length,
          // Already cleaned and capped by mapColumns (names at most 100 characters; at most 200 of them plus a "+N more").
          droppedColumns: file.dropped,
          createdAt: now,
        },
      });
      await tx.importedAddress.createMany({
        data: file.rows.map((r) => ({ importId: imp.id, rowNumber: r.rowNumber, line1: r.line1, unit: r.unit, city: r.city, state: r.state, zip: r.zip, lat: r.lat, lng: r.lng })),
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.profileId,
          action: "address_import.created",
          entityType: "AddressImport",
          entityId: imp.id,
          // The uploader confirmed their organization is authorized to use the file for the stated purpose.
          metadata: { rowCount: file.rowCount, kept: file.rows.length, skipped: file.skipped.length, droppedColumns: file.dropped.length, authorized: true },
          createdAt: now,
        },
      });
      return { ok: true as const, importId: imp.id, kept: file.rows.length, skipped: file.skipped.length };
    },
    { timeout: 30_000 }
  );
}

// ---------------------------------------------------------------------------
// Cut
// ---------------------------------------------------------------------------

/**
 * Address `a` is not on one of the job's walkbooks as a door: the same first
 * line and unit (ignoring case) and ZIP, from this file or another. An
 * address's own stop always matches itself, so no separate id test. Plain
 * equalities only: an OR here stops Postgres hashing the comparison (38 s at
 * 10,000 stops). The one definition of a repeat; the cut and the counts use it.
 */
const notOnJob = (jobId: string) => Prisma.sql`NOT EXISTS (
  SELECT 1 FROM "public"."WalkbookStop" s
  JOIN "public"."Walkbook" w ON w."id" = s."walkbookId"
  JOIN "public"."ImportedAddress" b ON b."id" = s."addressId"
  WHERE w."jobId" = ${jobId}::uuid
    AND b."zip" = a."zip" AND upper(b."line1") = upper(a."line1") AND upper(coalesce(b."unit", '')) = upper(coalesce(a."unit", '')))`;

/**
 * Cuts an import's addresses into numbered walkbooks on a job, in walking
 * order. Addresses already on one of the job's walkbooks are left out, so
 * cutting the same file again only picks up what's left; numbering carries on
 * from the job's last book. Any job status: walkbooks are preparation (a
 * draft can be readied before it publishes, a closed job keeps working for
 * the people already hired), and only hired workers can be handed one.
 */
export async function cutWalkbooks(actor: Staff, jobId: string, importId: string, perBookRaw: unknown, now = new Date()): Promise<{ ok: true; books: number; stops: number; repeats: number; jobId: string } | Fail> {
  if (!UUID_RE.test(jobId)) return { ok: false, reason: "Job not found." };
  if (!UUID_RE.test(importId)) return { ok: false, reason: "Pick a file to cut from." };
  // The lock is keyed on job.id as read back from the database, not on jobId as it arrived.
  const per = readStopsPerBook(perBookRaw);
  if (!per.ok) return { ok: false, reason: per.reason, errors: { stopsPerBook: per.reason } };
  return db().$transaction(
    async (tx) => {
      const job = await tx.job.findFirst({ where: { id: jobId, orgId: actor.orgId }, select: { id: true } });
      if (!job) return { ok: false as const, reason: "Job not found." };
      const imp = await tx.addressImport.findFirst({ where: { id: importId, orgId: actor.orgId }, select: { id: true } });
      if (!imp) return { ok: false as const, reason: "Pick a file to cut from." };
      await lock(tx, `walkbooks:${job.id}`);
      // One rule, in SQL, for what is left to cut (and for the count the page shows): not on one of the job's books already, by id or as the same door from another file.
      const free = await tx.$queryRaw<Array<{ id: string; line1: string; unit: string | null; zip: string }>>`
        SELECT a."id", a."line1", a."unit", a."zip" FROM "public"."ImportedAddress" a
        WHERE a."importId" = ${imp.id}::uuid AND ${notOnJob(job.id)}`;
      const unused = await tx.importedAddress.count({ where: { importId: imp.id, stops: { none: { walkbook: { jobId: job.id } } } } });
      const repeats = unused - free.length;
      if (!free.length) return { ok: false as const, reason: "Every address in this file is already on one of this job's walkbooks." };
      const last = await tx.walkbook.aggregate({ where: { jobId: job.id }, _max: { number: true } });
      const books = cutBooks(walkOrder(free), per.value, (last._max.number ?? 0) + 1);
      if (books[books.length - 1].number > MAX_BOOK_NUMBER) return { ok: false as const, reason: "That's more walkbooks than one job can hold. Use more stops per walkbook." };
      // Two statements however many books: ids are made here so the stops can name their book.
      const made = books.map((b) => ({ ...b, id: randomUUID() }));
      await tx.walkbook.createMany({ data: made.map((b) => ({ id: b.id, jobId: job.id, importId: imp.id, number: b.number, name: b.name, createdById: actor.profileId, createdAt: now })) });
      await tx.walkbookStop.createMany({ data: made.flatMap((b) => b.stops.map((s, i) => ({ walkbookId: b.id, addressId: s.id, stopNumber: i + 1 }))) });
      await tx.auditEvent.create({
        data: { actorId: actor.profileId, action: "walkbook.cut", entityType: "Job", entityId: job.id, metadata: { importId, books: books.length, stops: free.length, repeats, stopsPerBook: per.value, firstNumber: books[0].number }, createdAt: now },
      });
      return { ok: true as const, books: books.length, stops: free.length, repeats, jobId: job.id };
    },
    { timeout: 30_000 }
  );
}

// ---------------------------------------------------------------------------
// Assign
// ---------------------------------------------------------------------------

/**
 * Hands a walkbook to a worker hired on its job, or takes it back
 * (engagementId empty). A new row every time; nothing is overwritten.
 */
export async function assignWalkbook(actor: Staff, walkbookIdRaw: string, engagementIdRaw: unknown, now = new Date()): Promise<{ ok: true; jobId: string; changed: boolean } | Fail> {
  const walkbookId = String(walkbookIdRaw ?? "").trim().toLowerCase();
  if (!UUID_RE.test(walkbookId)) return { ok: false, reason: "Walkbook not found." };
  const engagementId = String(engagementIdRaw ?? "").trim().toLowerCase() || null;
  if (engagementId && !UUID_RE.test(engagementId)) return { ok: false, reason: "Pick a worker hired on this job." };
  return db().$transaction(async (tx) => {
    await lock(tx, `walkbook:${walkbookId}`);
    const wb = await tx.walkbook.findFirst({ where: { id: walkbookId, job: { orgId: actor.orgId } }, include: { job: { include: { jurisdiction: true } } } });
    if (!wb) return { ok: false as const, reason: "Walkbook not found." };
    const current = await tx.walkbookAssignment.findFirst({ where: { walkbookId }, orderBy: { createdAt: "desc" }, select: { engagementId: true, createdAt: true } });
    if ((current?.engagementId ?? null) === engagementId) return { ok: true as const, jobId: wb.jobId, changed: false };
    if (engagementId) {
      const e = await tx.engagement.findFirst({ where: { id: engagementId, jobId: wb.jobId }, select: { status: true, worker: { select: { closedAt: true } } } });
      if (!e || !(HIRED as readonly string[]).includes(e.status)) return { ok: false as const, reason: "Only workers hired on this job can hold its walkbooks." };
      if (e.worker.closedAt) return { ok: false as const, reason: "This worker has closed their account." };
      // Jurisdiction hard stop: handing out work freezes with scheduling.
      const freeze = canScheduleShift(wb.job.jurisdiction, now);
      if (!freeze.ok) return { ok: false as const, reason: `Handing out work is frozen: ${freeze.reasons.join(" ")}` };
    }
    // History reads newest-first by time: never stamp a row at or before the one it supersedes.
    const at = current && current.createdAt >= now ? new Date(current.createdAt.getTime() + 1) : now;
    await tx.walkbookAssignment.create({ data: { walkbookId, engagementId, actorId: actor.profileId, createdAt: at } });
    await tx.auditEvent.create({
      data: {
        actorId: actor.profileId,
        action: engagementId ? "walkbook.assigned" : "walkbook.returned",
        entityType: "Walkbook",
        entityId: walkbookId,
        metadata: { jobId: wb.jobId, engagementId, previousEngagementId: current?.engagementId ?? null },
        createdAt: at,
      },
    });
    return { ok: true as const, jobId: wb.jobId, changed: true };
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The newest assignment row of each walkbook: who holds it now. */
async function holders(walkbookIds: string[]) {
  if (!walkbookIds.length) return new Map<string, { engagementId: string | null; at: Date }>();
  // DISTINCT ON in the database: one row per book, however long its history grows.
  const rows = await db().$queryRaw<Array<{ walkbookId: string; engagementId: string | null; createdAt: Date }>>`
    SELECT DISTINCT ON ("walkbookId") "walkbookId", "engagementId", "createdAt"
    FROM "public"."WalkbookAssignment"
    WHERE "walkbookId" = ANY(${walkbookIds}::uuid[])
    ORDER BY "walkbookId", "createdAt" DESC`;
  return new Map(rows.map((r) => [r.walkbookId, { engagementId: r.engagementId, at: r.createdAt }]));
}

/** Everything the job's walkbook page shows staff. */
export async function loadJobWalkbooks(orgId: string, jobId: string) {
  if (!UUID_RE.test(jobId)) return null;
  const job = await db().job.findFirst({ where: { id: jobId, orgId }, select: { id: true, title: true, status: true } });
  if (!job) return null;
  const [books, imports, hired] = await Promise.all([
    db().walkbook.findMany({
      where: { jobId },
      orderBy: { number: "asc" },
      select: { id: true, number: true, name: true, createdAt: true, importId: true, _count: { select: { stops: true } } },
    }),
    db().addressImport.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: IMPORTS_SHOWN,
      select: {
        id: true,
        fileName: true,
        recordSource: true,
        purpose: true,
        license: true,
        rowCount: true,
        keptCount: true,
        droppedColumns: true,
        createdAt: true,
      },
    }),
    db().engagement.findMany({
      where: { jobId, status: { in: [...HIRED] }, worker: { closedAt: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true, worker: { select: { displayName: true } } },
    }),
  ]);
  const left = imports.length
    ? await db().$queryRaw<Array<{ importId: string; n: number }>>`
        SELECT a."importId", count(*)::int AS n FROM "public"."ImportedAddress" a
        WHERE a."importId" = ANY(${imports.map((i) => i.id)}::uuid[]) AND ${notOnJob(job.id)}
        GROUP BY a."importId"`
    : [];
  const leftBy = new Map(left.map((r) => [r.importId, r.n]));
  const progress = await loadJobProgress(job.id, new Map(books.map((b) => [b.id, b._count.stops])));
  const held = await holders(books.map((b) => b.id));
  const engIds = [...new Set([...held.values()].map((h) => h.engagementId).filter((x): x is string => !!x))];
  const holderEngagements = engIds.length
    ? await db().engagement.findMany({ where: { id: { in: engIds } }, select: { id: true, status: true, worker: { select: { displayName: true, closedAt: true } } } })
    : [];
  const byEng = new Map(holderEngagements.map((e) => [e.id, e]));
  return {
    job,
    hired: hired.map((e) => ({ engagementId: e.id, name: e.worker.displayName })),
    imports: imports.map((i) => ({ ...i, unassigned: leftBy.get(i.id) ?? 0 })),
    books: books.map((b) => {
      const h = held.get(b.id);
      const e = h?.engagementId ? byEng.get(h.engagementId) : undefined;
      return {
        id: b.id,
        number: b.number,
        name: b.name,
        stops: b._count.stops,
        importId: b.importId,
        progress: progress.get(b.id)!,
        holder: e ? { engagementId: e.id, name: e.worker.displayName, stillHired: (HIRED as readonly string[]).includes(e.status) && !e.worker.closedAt, since: h!.at } : null,
      };
    }),
  };
}

const STOP_SELECT = {
  id: true,
  stopNumber: true,
  address: { select: { line1: true, unit: true, city: true, state: true, zip: true, lat: true, lng: true } },
} as const;

/** One walkbook for staff: its stops in order and who has held it. */
export async function loadWalkbookForStaff(orgId: string, walkbookId: string) {
  if (!UUID_RE.test(walkbookId)) return null;
  const wb = await db().walkbook.findFirst({
    where: { id: walkbookId, job: { orgId } },
    select: {
      id: true,
      number: true,
      name: true,
      jobId: true,
      job: { select: { title: true } },
      import: { select: { fileName: true, recordSource: true, purpose: true, license: true } },
      stops: { orderBy: { stopNumber: "asc" }, select: STOP_SELECT },
      assignments: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, createdAt: true, engagement: { select: { worker: { select: { displayName: true } } } } },
      },
    },
  });
  if (!wb) return null;
  const states = await loadStopStates(wb.stops.map((s) => s.id));
  return {
    ...wb,
    stops: wb.stops.map((s) => ({ id: s.id, stopNumber: s.stopNumber, ...s.address, result: states.get(s.id) ?? UNVISITED })),
    history: wb.assignments.map((a) => ({ id: a.id, at: a.createdAt, name: a.engagement?.worker.displayName ?? null })),
  };
}

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
    select: { id: true, number: true, name: true, job: { select: { id: true, title: true } }, stops: { orderBy: { stopNumber: "asc" }, select: STOP_SELECT } },
  });
  // A book carries its state with it: what the last holder recorded is what the next one sees.
  const states = await loadStopStates(books.flatMap((b) => b.stops.map((s) => s.id)));
  return books.map((b) => ({ ...b, stops: b.stops.map((s): { id: string; stopNumber: number; result: StopState } & (typeof b.stops)[number]["address"] => ({ id: s.id, stopNumber: s.stopNumber, ...s.address, result: states.get(s.id) ?? UNVISITED })) }));
}
