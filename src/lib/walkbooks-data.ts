/**
 * File-to-walkbook (W1), the database half. Staff bring an authorized file
 * (every column is stored for 30 days, never shown to workers: src/lib/walkbooks.ts), cut its addresses into
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
import { flat, HIRED, holders, STOP_SELECT } from "@/lib/walkbook-shared";

import { UNVISITED } from "@/lib/stop-outcomes";

import { cutBooks, NEEDS_STATE_ACK, readAddressFile, RETENTION_DAYS, readStopsPerBook, validateImportMeta, walkOrder } from "@/lib/walkbooks";

type Tx = Prisma.TransactionClient;
type Fail = { ok: false; reason: string; errors?: Record<string, string> };
export type Staff = { profileId: string; orgId: string };

const lock = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
/** Confirmed workers: hired on the job (accepted offer or instant claim). */
/** Walkbook.number's ceiling in the database (Walkbook_number). */
const MAX_BOOK_NUMBER = 100_000;
/** Imports listed on a job's walkbook page. */
const IMPORTS_SHOWN = 50;

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Stores an authorized file for the organization: each row's address, its
 * source record ID and every other column (names, party, vote history: the
 * most sensitive data in the system, which never leaves the importer, the
 * purge and the staff export). `meta` is what the uploader states: where the
 * file came from, what it is for, its license, and that they are authorized
 * to use it. The names and addresses are deleted 30 days later, or sooner.
 */
export async function importAddresses(actor: Staff, meta: Record<string, unknown>, text: string, now = new Date()): Promise<{ ok: true; importId: string; kept: number; skipped: number } | Fail> {
  const m = validateImportMeta(meta);
  if (!m.ok) return { ok: false, reason: "Fix the highlighted fields.", errors: m.errors };
  const read = readAddressFile(text);
  if (!read.ok) return { ok: false, reason: read.reason, errors: { file: read.reason } };
  const { file } = read;
  // Arizona restricts voter-list data online (A.R.S. 16-168): a file with Arizona addresses needs its own acknowledgement.
  if (file.states.some((st) => (NEEDS_STATE_ACK as readonly string[]).includes(st)) && meta.ackAZ !== "on") {
    return { ok: false, reason: "Fix the highlighted fields.", errors: { ackAZ: "This file has Arizona addresses: confirm you may upload it here." } };
  }
  try {
  return await db().$transaction(
    async (tx) => {
      const imp = await tx.addressImport.create({
        data: {
          orgId: actor.orgId,
          uploadedById: actor.profileId,
          ...m.value,
          deleteAfter: new Date(now.getTime() + RETENTION_DAYS * 86_400_000),
          rowCount: file.rowCount,
          keptCount: file.rows.length,
          // Already cleaned and capped by mapColumns (names at most 100 characters; at most 200 of them plus a "+N more").
          droppedColumns: file.dropped,
          createdAt: now,
        },
      });
      await tx.importedAddress.createMany({
        data: file.rows.map((r) => ({
          importId: imp.id,
          rowNumber: r.rowNumber,
          line1: r.line1,
          unit: r.unit,
          city: r.city,
          state: r.state,
          zip: r.zip,
          lat: r.lat,
          lng: r.lng,
          sourceRecordId: r.sourceRecordId,
          sourceData: r.sourceData ?? Prisma.DbNull,
        })),
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.profileId,
          action: "address_import.created",
          entityType: "AddressImport",
          entityId: imp.id,
          // The uploader confirmed their organization is authorized to use the file for the stated purpose.
          metadata: { rowCount: file.rowCount, kept: file.rows.length, skipped: file.skipped.length, droppedColumns: file.dropped.length, storedColumns: file.storedColumns.length, recordIdColumn: !!file.recordIdColumn, sourceSystem: m.value.sourceSystem, states: file.states, authorized: true },
          createdAt: now,
        },
      });
      return { ok: true as const, importId: imp.id, kept: file.rows.length, skipped: file.skipped.length };
    },
    { timeout: 30_000 }
  );
  } catch (e) {
    // A database refusal can quote the failing row (names, phone numbers, party) in its message. That text must never reach a log or an error report, so only its code does, and the person is told nothing was saved.
    console.error("[turfcut] address import failed", e instanceof Prisma.PrismaClientKnownRequestError ? e.code : "error");
    return { ok: false, reason: "The file couldn't be saved, so nothing was imported. Check it and try again." };
  }
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
      const imp = await tx.addressImport.findFirst({ where: { id: importId, orgId: actor.orgId }, select: { id: true, purgedAt: true } });
      if (!imp) return { ok: false as const, reason: "Pick a file to cut from." };
      // Cutting and deleting a file's addresses take the same lock, in this order: the file's, then the job's.
      await lock(tx, `import:${imp.id}`);
      const fresh = await tx.addressImport.findUnique({ where: { id: imp.id }, select: { purgedAt: true } });
      if (fresh?.purgedAt) return { ok: false as const, reason: "This file's data has been deleted. Its doors already on this job can't be told apart from new ones any more, so don't import it again for this job while its walkbooks are in use." };
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


/** Everything the job's walkbook page shows staff. */
export async function loadJobWalkbooks(orgId: string, jobId: string) {
  if (!UUID_RE.test(jobId)) return null;
  const job = await db().job.findFirst({ where: { id: jobId, orgId }, select: { id: true, title: true, status: true, type: true } });
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
        sourceSystem: true,
        deleteAfter: true,
        purgedAt: true,
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
    stops: wb.stops.map((s) => ({ id: s.id, stopNumber: s.stopNumber, ...flat(s.address), result: states.get(s.id) ?? UNVISITED })),
    history: wb.assignments.map((a) => ({ id: a.id, at: a.createdAt, name: a.engagement?.worker.displayName ?? null })),
  };
}


// ---------------------------------------------------------------------------
// Deleting names and addresses
// ---------------------------------------------------------------------------

export type PurgeReason = "requested" | "expired" | "jobs_closed";

/** Days after the last job a file was cut for closes before its data is deleted: time to export the return file. */
export const CLOSED_GRACE_DAYS = 7;

/**
 * Deletes an import's addresses: the rows of ImportedAddress, and with them
 * the record IDs and every other column of the file. The stops stay
 * (addressId goes null), with their outcomes and poll answers, keyed by book
 * and stop number. It is the one place a file's personal data is removed, so
 * the three ways in (the organization's button, the 30 days running out,
 * every job it was cut for closing) all come through here. Safe to call twice.
 */
/** What makes a file due for the daily purge: its 30 days are up, or every job it was cut for closed over the grace ago. */
function dueNow(now: Date): Prisma.AddressImportWhereInput {
  const graceEnds = new Date(now.getTime() - CLOSED_GRACE_DAYS * 86_400_000);
  return {
    purgedAt: null,
    OR: [
      { deleteAfter: { lte: now } },
      // Cut for at least one job, and every one of them closed more than the grace ago.
      { walkbooks: { some: {} }, NOT: { walkbooks: { some: { job: { OR: [{ status: { not: "CLOSED" } }, { updatedAt: { gt: graceEnds } }] } } } } },
    ],
  };
}

export async function purgeImport(importId: string, reason: PurgeReason, actorId: string | null, now = new Date()): Promise<{ ok: true; addresses: number; already: boolean; notDue?: true } | Fail> {
  if (!UUID_RE.test(importId)) return { ok: false, reason: "File not found." };
  return db().$transaction(
    async (tx) => {
    const imp = await tx.addressImport.findUnique({ where: { id: importId.toLowerCase() }, select: { id: true, purgedAt: true } });
    if (!imp) return { ok: false as const, reason: "File not found." };
    // Under the lock cutting takes, so a book can't be cut from addresses in the middle of being deleted.
    await lock(tx, `import:${imp.id}`);
    const again = await tx.addressImport.findUnique({ where: { id: imp.id }, select: { purgedAt: true } });
    if (again?.purgedAt) return { ok: true as const, addresses: 0, already: true };
    // A scheduled purge checks again, under the lock, that the file is still due: the daily run chose it earlier, and a
    // cut onto an open job since then (which takes this lock) means its addresses are in use. The organization's own
    // "delete now" is not a schedule: it always goes ahead.
    if (reason !== "requested" && !(await tx.addressImport.count({ where: { id: imp.id, ...dueNow(now) } }))) {
      return { ok: true as const, addresses: 0, already: false, notDue: true as const };
    }
    const gone = await tx.importedAddress.deleteMany({ where: { importId: imp.id } });
    await tx.addressImport.update({ where: { id: imp.id }, data: { purgedAt: now } });
    await tx.auditEvent.create({ data: { actorId, action: "address_import.purged", entityType: "AddressImport", entityId: imp.id, metadata: { reason, addresses: gone.count }, createdAt: now } });
    return { ok: true as const, addresses: gone.count, already: false };
    },
    // A purge waiting on a long cut's lock must not time out at the 5-second default.
    { timeout: 30_000, maxWait: 10_000 }
  );
}

/** The organization deletes one of its own files now, instead of waiting for the 30 days. */
export async function purgeOwnImport(actor: Staff, importId: string, now = new Date()): Promise<{ ok: true; addresses: number; already: boolean } | Fail> {
  if (!UUID_RE.test(importId)) return { ok: false, reason: "File not found." };
  const own = await db().addressImport.findFirst({ where: { id: importId.toLowerCase(), orgId: actor.orgId }, select: { id: true } });
  if (!own) return { ok: false, reason: "File not found." };
  return purgeImport(own.id, "requested", actor.profileId, now);
}

/**
 * Deletes the names and addresses of every import that is due: its 30 days
 * are up, or every job it was cut for closed at least CLOSED_GRACE_DAYS ago
 * (time to export the return file). Run daily by the cron route. Oldest
 * first, in batches, within a time budget; one import failing is skipped for
 * this run and doesn't hold up the rest.
 */
export async function purgeDueImports(now = new Date(), budgetMs = 45_000): Promise<{ purged: number; addresses: number; failed: number }> {
  const started = Date.now();
  const skip: string[] = [];
  // Chosen as due, then found not due under the lock (a cut since): passed over this run, not counted as failed.
  const passed: string[] = [];
  let purged = 0;
  let addresses = 0;
  for (;;) {
    if (Date.now() - started > budgetMs) break;
    const due = await db().addressImport.findMany({
      where: { ...dueNow(now), id: { notIn: [...skip, ...passed] } },
      orderBy: { deleteAfter: "asc" },
      select: { id: true, deleteAfter: true },
      take: 100,
    });
    if (!due.length) break;
    for (const d of due) {
      if (Date.now() - started > budgetMs) break;
      try {
        const r = await purgeImport(d.id, d.deleteAfter <= now ? "expired" : "jobs_closed", null, now);
        if (r.ok && r.notDue) passed.push(d.id);
        else if (r.ok && !r.already) {
          purged++;
          addresses += r.addresses;
        } else skip.push(d.id);
      } catch (e) {
        skip.push(d.id);
        console.error("[turfcut] address import purge failed", d.id, (e as { code?: unknown })?.code ?? "error");
      }
    }
  }
  return { purged, addresses, failed: skip.length ? await failedCount(skip) : 0 };
}

/** Of the ids skipped in a run, how many are still not purged (those that failed rather than were already done). */
async function failedCount(ids: string[]): Promise<number> {
  return db().addressImport.count({ where: { id: { in: ids }, purgedAt: null } });
}
