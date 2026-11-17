/* W3 acceptance checks: the walkbook console on real Postgres. Filters narrow the table but not the chip counts; paging; per-worker summary; a stop's whole history newest first; org isolation on every read; the export writes the filtered rows and guards formulas (tests/acceptance/run.sh). */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createJob, publishJob } from "@/lib/jobs-data";
import { validateJob } from "@/lib/jobs";
import { claimJob } from "@/lib/engagements-data";
import { assignWalkbook, cutWalkbooks, importAddresses, loadJobWalkbooks, loadWalkbookForStaff } from "@/lib/walkbooks-data";
import { recordStopOutcome } from "@/lib/stop-outcomes-data";
import { loadConsole, loadExportRows, loadStopHistory } from "@/lib/stop-console-data";
import { exportCsv, parseConsoleQuery } from "@/lib/stop-console";

const ORG = "00000000-0000-0000-0000-000000000001";
const OTHER_ORG = "00000000-0000-0000-0000-0000000000ff";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const W = ["00000000-0000-0000-0000-000000000101", "00000000-0000-0000-0000-000000000102"];
const JOB = "00000000-0000-0000-0000-000000000011";
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const q = (sp: Record<string, string> = {}) => parseConsoleQuery(sp);

// 120 addresses on one street, all even numbers, so the walk runs high to low: two books of 60. Every tenth has a point (i = 9, 19 ... 119: the first stop of each book among them).
const rows = ["address,address2,city,state,zip,latitude,longitude"];
for (let i = 0; i < 120; i++) rows.push(`${100 + i * 2} Pine St,${i === 5 ? "=HYPERLINK(1)" : ""},Denver,CO,80203,${i % 10 === 9 ? (39.74 + i / 10000).toFixed(5) : ""},${i % 10 === 9 ? "-104.98" : ""}`);
const META = { fileName: "big.csv", recordSource: "Own list", purpose: "Canvassing", license: "Own list", authorized: "on" };

(async () => {
  const p = db();
  await p.profile.createMany({ data: [{ id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" }] });
  await p.organization.update({ where: { id: ORG }, data: { approved: true, contractorTermsSignedAt: new Date(), classificationReviewedAt: new Date() } });
  await p.organization.create({ data: { id: OTHER_ORG, name: "Other org" } });
  const seeded = await p.job.findUniqueOrThrow({ where: { id: JOB } });
  const year = new Date().getUTCFullYear() + 1;
  const v = validateJob({
    type: "PETITION", title: "Console job", jurisdictionId: seeded.jurisdictionId, startsAt: `${year}-03-01`, endsAt: `${year}-04-01`, city: "Denver", state: "CO",
    compensationMethod: "HOURLY", payRate: "24", headcount: "40", hiringModes: ["instant_claim"], campaignType: "ballot_measure", affiliation: "nonpartisan",
    message: "Qualify it.", contactEmergency: "a", contactDisputes: "b", contactLostMaterials: "c", launchMode: "SELF",
  });
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  const job = await createJob(ORG, OWNER, v.value);
  await publishJob(job.id, ORG, OWNER);
  const owner = { profileId: OWNER, orgId: ORG };
  const imp = await importAddresses(owner, META, rows.join("\n"));
  await cutWalkbooks(owner, job.id, imp.ok ? imp.importId : "", "60");
  const e0 = await claimJob(W[0], W[0], job.id), e1 = await claimJob(W[1], W[1], job.id);
  const [b1, b2] = (await loadJobWalkbooks(ORG, job.id))!.books.map((b) => b.id);
  await assignWalkbook(owner, b1, e0.ok ? e0.engagementId : "");
  await assignWalkbook(owner, b2, e1.ok ? e1.engagementId : "");
  const s1 = (await loadWalkbookForStaff(ORG, b1))!.stops;
  const s2 = (await loadWalkbookForStaff(ORG, b2))!.stops;
  const rec = (w: number, stopId: string, f: Record<string, unknown>) => recordStopOutcome({ workerId: W[w], profileId: W[w] }, stopId, randomUUID(), f);
  // Worker 0: stops 1-3 Done with 2, 3 and 1 signatures; stop 4 Come back; stop 5 Don't knock. Worker 1: stop 1 Not home.
  await rec(0, s1[0].id, { outcome: "DONE", signatures: "2" });
  await rec(0, s1[1].id, { outcome: "DONE", signatures: "3" });
  await rec(0, s1[2].id, { outcome: "DONE", signatures: "1" });
  await rec(0, s1[3].id, { outcome: "COME_BACK" });
  await rec(0, s1[4].id, { outcome: "DO_NOT_KNOCK" });
  await rec(1, s2[0].id, { outcome: "NOT_HOME" });
  await rec(0, s1[0].id, { outcome: "DONE", signatures: "5" }); // a correction: the newest wins

  // --- The page, unfiltered ---
  const all = (await loadConsole(ORG, job.id, q()))!;
  check("the whole job is 120 stops: 50 on the first page of 3", all.totalStops === 120 && all.total === 120 && all.stops.length === 50 && all.pages === 3, [all.total, all.stops.length, all.pages]);
  check("the chip counts: 3 Done, 1 Come back, 1 Don't knock, 1 Not home, 114 to do", all.counts.byKind("DONE") === 3 && all.counts.byKind("COME_BACK") === 1 && all.counts.byKind("DO_NOT_KNOCK") === 1 && all.counts.byKind("NOT_HOME") === 1 && all.counts.todo === 114, all.counts.todo);
  check("stops come in book then stop order", all.stops[0].bookNumber === 1 && all.stops[0].stopNumber === 1 && all.stops[49].stopNumber === 50);
  check("the newest outcome of a corrected stop is what shows (5 signatures, not 2)", all.stops[0].result.answers.signatures === 5, all.stops[0].result);
  const page3 = (await loadConsole(ORG, job.id, q({ page: "3" })))!;
  check("the last page holds the remaining 20", page3.stops.length === 20 && page3.stops[19].bookNumber === 2 && page3.stops[19].stopNumber === 60, page3.stops.length);
  check("a page past the end clamps to the last", (await loadConsole(ORG, job.id, q({ page: "99" })))!.page === 3);

  // --- Filters narrow the table, never the chip counts ---
  const done = (await loadConsole(ORG, job.id, q({ outcome: "DONE" })))!;
  check("filtering to Done: 3 rows, and the chips still count the whole job", done.total === 3 && done.stops.length === 3 && done.counts.todo === 114, [done.total, done.counts.todo]);
  const todo = (await loadConsole(ORG, job.id, q({ outcome: "todo", book: b2 })))!;
  check("filtering to To do in book 2: 59 rows (stop 1 has an outcome)", todo.total === 59 && todo.stops.every((s) => s.bookId === b2 && !s.result.outcome), todo.total);
  const byWorker = (await loadConsole(ORG, job.id, q({ worker: e1.ok ? e1.engagementId : "" })))!;
  check("filtering by the worker holding the book: that book's 60 stops, named", byWorker.total === 60 && byWorker.holderName(byWorker.stops[0].holderEngagementId) === "Jordan Blake", [byWorker.total, byWorker.holderName(byWorker.stops[0].holderEngagementId)]);
  const both = (await loadConsole(ORG, job.id, q({ outcome: "DONE", book: b2 })))!;
  check("filters combine: Done in book 2 is nobody", both.total === 0 && both.stops.length === 0);

  // --- The map and the workers ---
  check("pins are the stops with a point (12 of 120), each with its state", all.pins.length === 12 && !all.pinsTruncated && all.pins[0].result.outcome === "DONE", all.pins.length);
  const filteredPins = (await loadConsole(ORG, job.id, q({ outcome: "todo" })))!;
  check("pins follow the filter: two pinned stops have an outcome (book 1 and book 2 stop 1), so To do has 10", filteredPins.pins.length === 10, filteredPins.pins.length);
  const w0 = all.workers.find((w) => w.name === "Alex Rivera")!, w1 = all.workers.find((w) => w.name === "Jordan Blake")!;
  check("the worker table: Alex holds 1 book (60 stops) and recorded 4 settled stops (3 Done + 1 Don't knock; Come back is still open) with 9 signatures (5 + 3 + 1: the corrected 5 counts, not the first 2)", w0.books === 1 && w0.stops === 60 && w0.recordedSettled === 4 && w0.recordedSignatures === 9, w0);
  check("…and Jordan holds 1 book and recorded 1 settled stop, no signatures", w1.books === 1 && w1.recordedSettled === 1 && w1.recordedSignatures === 0, w1);

  // --- The inspector ---
  const hist = (await loadStopHistory(ORG, s1[0].id))!;
  check("a stop's history lists every outcome newest first: the correction, then the first Done", hist.history.length === 2 && hist.history[0].answers.signatures === 5 && hist.history[1].answers.signatures === 2 && hist.history[0].by === "Alex Rivera", hist.history);
  check("a stop with no outcome has an empty history", (await loadStopHistory(ORG, s1[10].id))!.history.length === 0);

  // --- Org isolation ---
  check("another organization sees no console, history or export", (await loadConsole(OTHER_ORG, job.id, q())) === null && (await loadStopHistory(OTHER_ORG, s1[0].id)) === null && !(await loadExportRows(OTHER_ORG, job.id, q())).ok);
  check("a malformed id is just 'not found'", (await loadConsole(ORG, "nope", q())) === null && (await loadStopHistory(ORG, "nope")) === null);

  // --- Export ---
  const ex = await loadExportRows(ORG, job.id, q({ book: b1 }));
  check("the export writes the filtered rows: book 1's 60 stops", ex.ok && ex.rows.length === 60, ex.ok ? ex.rows.length : ex);
  if (ex.ok) {
    const csv = exportCsv(ex.rows);
    check("…with outcomes, signatures and who held it", csv.includes('"Done","","","5"') && csv.includes('"Come back"') && csv.includes('"Alex Rivera"'), csv.split("\n").slice(0, 3));
    check("…and a formula-shaped unit is neutralised, not stored as a formula", csv.includes(`"'=HYPERLINK(1)"`) || !csv.includes("HYPERLINK"), csv.split("\n").find((l) => l.includes("HYPERLINK")));
  }

  // --- A hand-on moves the book, never the credit ---
  await assignWalkbook(owner, b1, e1.ok ? e1.engagementId : "");
  const after = (await loadConsole(ORG, job.id, q()))!;
  const a0 = after.workers.find((w) => w.name === "Alex Rivera")!, a1 = after.workers.find((w) => w.name === "Jordan Blake")!;
  check("after Alex's book is handed to Jordan: Alex holds nothing but keeps the 4 settled stops and 9 signatures he recorded", a0.books === 0 && a0.stops === 0 && a0.recordedSettled === 4 && a0.recordedSignatures === 9, a0);
  check("…and Jordan holds both books (120 stops) but has recorded only his own 1", a1.books === 2 && a1.stops === 120 && a1.recordedSettled === 1 && a1.recordedSignatures === 0, a1);
  await assignWalkbook(owner, b2, "");
  const none = (await loadConsole(ORG, job.id, q({ worker: "none" })))!;
  check("after a take-back, 'held by nobody' lists exactly that book's 60 stops", none.total === 60 && none.stops.every((s) => s.bookId === b2 && s.holderEngagementId === null), none.total);
  const inspectJob = await loadStopHistory(ORG, s1[0].id, job.id);
  check("the inspector is scoped to the job: the same stop under another job id is not found", !!inspectJob && (await loadStopHistory(ORG, s1[0].id, randomUUID())) === null);

  await p.$disconnect();
  if (fails) { console.log(`${fails} failed`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
