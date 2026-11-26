/* W1 acceptance checks: file-to-walkbook on real Postgres. Every column and the record ID are kept (names, party, vote history: never shown to a worker or staff screen), a few risk columns never are, and the names and addresses are deleted after 30 days, on request, or when the jobs close (stops and outcomes stay); cutting numbers books and never puts an address on two of a job's books; only hired workers hold books; holding is append-only history; the jurisdiction hard stop freezes handing out work; workers see only what they hold now (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { withVoterData } from "@/lib/voter-data-guard";
import { createJob, publishJob } from "@/lib/jobs-data";
import { validateJob } from "@/lib/jobs";
import { claimJob } from "@/lib/engagements-data";
import { randomUUID } from "node:crypto";
import { assignWalkbook, cutWalkbooks, importAddresses, loadJobWalkbooks, loadWalkbookForStaff, purgeDueImports, purgeOwnImport } from "@/lib/walkbooks-data";
import { loadWorkerWalkbooks } from "@/lib/walkbooks-worker-data";
import { recordStopOutcome } from "@/lib/stop-outcomes-data";
import { loadConsole, loadExportRows } from "@/lib/stop-console-data";
import { exportCsv, parseConsoleQuery } from "@/lib/stop-console";

const ORG = "00000000-0000-0000-0000-000000000001";
const OTHER_ORG = "00000000-0000-0000-0000-0000000000ff";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const W = ["00000000-0000-0000-0000-000000000101", "00000000-0000-0000-0000-000000000102", "00000000-0000-0000-0000-000000000103"];
const JOB = "00000000-0000-0000-0000-000000000011";
let fails = 0;
/** A check that looks at what was stored: allowed to read the import's columns, like the importer (voter-data-guard). */
const inspect = <T,>(fn: () => PromiseLike<T>) => withVoterData("acceptance check", fn);
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };

const FILE = [
  "Voter ID,First Name,Last Name,Party,Residence Address,Apt,City,State,Zip,2024 General,SSN,Latitude,Longitude",
  "V1,Ada,Lovelace,DEM,12 Elm St,,Denver,CO,80202,Y,123-45-6789,39.75,-104.99",
  "V2,Alan,Turing,REP,11 Elm St,,Denver,CO,80202,N,222-33-4444,,",
  "V3,Grace,Hopper,UNA,13 Elm St,Unit 2,Denver,CO,80202,Y,333-22-1111,,",
  "V4,Linus,T,LIB,5 Ash Ave,,Denver,CO,80202,Y,444-55-6666,,",
  "V5,No,Address,DEM,,,Denver,CO,80202,Y,555-66-7777,,",
].join("\n");
const META = { fileName: "county.csv", recordSource: "County voter file, Oct 2026", purpose: "Door canvassing on this job", license: "County public-records terms", authorized: "on" };

(async () => {
  const p = db();
  await p.profile.createMany({ data: [{ id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" }] });
  await p.organization.update({ where: { id: ORG }, data: { approved: true, contractorTermsSignedAt: new Date(), classificationReviewedAt: new Date() } });
  await p.organization.create({ data: { id: OTHER_ORG, name: "Other org" } });
  const seeded = await p.job.findUniqueOrThrow({ where: { id: JOB } });
  const year = new Date().getUTCFullYear() + 1;
  const job = await createJob(ORG, OWNER, (() => {
    const v = validateJob({
      type: "CANVASS", title: "Walkbook test", jurisdictionId: seeded.jurisdictionId, startsAt: `${year}-03-01`, endsAt: `${year}-04-01`, city: "Denver", state: "CO",
      compensationMethod: "HOURLY", payRate: "24", headcount: "40", hiringModes: ["instant_claim"], campaignType: "ballot_measure", affiliation: "nonpartisan",
      message: "Talk to voters.", contactEmergency: "a", contactDisputes: "b", contactLostMaterials: "c", launchMode: "SELF",
    });
    if (!v.ok) throw new Error(JSON.stringify(v.errors));
    return v.value;
  })());
  check("the job publishes", (await publishJob(job.id, ORG, OWNER)).ok);
  const owner = { profileId: OWNER, orgId: ORG };

  // --- Import: the address, the record ID and every other column ---
  const noMeta = await importAddresses(owner, { fileName: "x.csv" }, FILE);
  check("an import needs a source, purpose, license and the authorization box", !noMeta.ok && ["recordSource", "purpose", "license", "authorized"].every((k) => noMeta.errors?.[k]), noMeta);
  const imp = await importAddresses(owner, META, FILE);
  check("an authorized file imports: four addresses kept, one row skipped", imp.ok && imp.kept === 4 && imp.skipped === 1, imp);
  const importId = imp.ok ? imp.importId : "";
  const stored = await inspect(() => p.importedAddress.findMany({ where: { importId } }));
  const addrOnly = JSON.stringify(stored.map((a) => ({ line1: a.line1, unit: a.unit, city: a.city, state: a.state, zip: a.zip, lat: a.lat, lng: a.lng })));
  check("the address fields carry no name, party or ID: those live in the row's own data", !/Ada|Lovelace|Turing|Hopper|DEM|REP|UNA|LIB|V1|V2|123-45/.test(addrOnly), addrOnly);
  const ada = stored.find((r) => r.line1 === "12 Elm St")!;
  check("the source record ID is kept, and every other column with it (names, party, vote history)", ada.sourceRecordId === "V1" && JSON.stringify(Object.entries(ada.sourceData as Record<string, string>).sort()) === JSON.stringify(Object.entries({ "First Name": "Ada", "Last Name": "Lovelace", Party: "DEM", "2024 General": "Y" }).sort()), ada);
  check("a government ID column is never stored: the SSN is nowhere in the database", !JSON.stringify(stored).includes("123-45") && (await inspect(() => p.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "ImportedAddress" WHERE "sourceData"::text LIKE '%-45-%' OR "sourceData"::text LIKE '%SSN%'`)))[0].n === 0);
  const rec = await inspect(() => p.addressImport.findUniqueOrThrow({ where: { id: importId } }));
  check("the import says what it left out by name: just the SSN column", JSON.stringify(rec.droppedColumns) === JSON.stringify(["SSN"]), rec.droppedColumns);
  check("it will be deleted in 30 days, and nothing has been deleted yet", rec.purgedAt === null && Math.abs(rec.deleteAfter.getTime() - rec.createdAt.getTime() - 30 * 86_400_000) < 1000, [rec.deleteAfter, rec.createdAt]);
  check("the point is kept only where the file gave it", stored.filter((s) => s.lat !== null).length === 1);
  const az = await importAddresses(owner, META, "address,city,state,zip\n1 Cactus Rd,Phoenix,AZ,85001\n");
  check("a file with Arizona addresses needs its own acknowledgement (A.R.S. 16-168)", !az.ok && !!az.errors?.ackAZ, az);
  check("…and imports once it is given", (await importAddresses(owner, { ...META, ackAZ: "on" }, "address,city,state,zip\n1 Cactus Rd,Phoenix,AZ,85001\n")).ok);
  const sys = await importAddresses(owner, { ...META, sourceSystem: "NGP" }, FILE);
  check("a source system outside the list is refused", !sys.ok && !!sys.errors?.sourceSystem, sys);
  check("importing is audited", !!(await p.auditEvent.findFirst({ where: { entityId: importId, action: "address_import.created" } })));

  // --- Cut ---
  const otherCut = await cutWalkbooks({ profileId: OWNER, orgId: OTHER_ORG }, job.id, importId, "2");
  check("another organization can't cut on the job", !otherCut.ok && /not found/.test(otherCut.reason), otherCut);
  const badPer = await cutWalkbooks(owner, job.id, importId, "0");
  check("stops per book is checked", !badPer.ok && !!badPer.errors?.stopsPerBook, badPer);
  const cut = await cutWalkbooks(owner, job.id, importId, "2");
  check("cutting four addresses two to a book makes books 1 and 2", cut.ok && cut.books === 2 && cut.stops === 4, cut);
  const again = await cutWalkbooks(owner, job.id, importId, "2");
  check("cutting the same file again finds nothing left", !again.ok && /already on one/.test(again.reason), again);
  const page = await loadJobWalkbooks(ORG, job.id);
  check("books are numbered and named in walking order", page?.books.map((b) => `${b.number}:${b.name}:${b.stops}`).join("|") === "1:Book 1 · Ash Ave to Elm St:2|2:Book 2 · Elm St:2", page?.books);
  const b1 = await loadWalkbookForStaff(ORG, page!.books[0].id);
  check("stops go odd side up, then even: 5 Ash, 11 Elm, then 13 Elm and 12 Elm", b1?.stops.map((s) => s.line1).join("|") === "5 Ash Ave|11 Elm St" && (await loadWalkbookForStaff(ORG, page!.books[1].id))?.stops.map((s) => s.line1).join("|") === "13 Elm St|12 Elm St", b1?.stops);
  check("another organization can't read a walkbook", (await loadWalkbookForStaff(OTHER_ORG, page!.books[0].id)) === null && (await loadJobWalkbooks(OTHER_ORG, job.id)) === null);
  check("the import shows nothing left to cut on this job", page?.imports.find((i) => i.id === importId)?.unassigned === 0, page?.imports);

  // --- Assign: hired workers only ---
  const [book1, book2] = page!.books.map((b) => b.id);
  const notHired = await p.engagement.create({ data: { jobId: job.id, workerId: W[2], status: "APPLIED" } });
  const applicant = await assignWalkbook(owner, book1, notHired.id);
  check("an applicant can't hold a walkbook", !applicant.ok && /hired/.test(applicant.reason), applicant);
  const h0 = await claimJob(W[0], W[0], job.id);
  const h1 = await claimJob(W[1], W[1], job.id);
  const e0 = h0.ok ? h0.engagementId : "";
  const e1 = h1.ok ? h1.engagementId : "";
  check("two workers are hired", !!e0 && !!e1, { h0, h1 });
  const otherAssign = await assignWalkbook({ profileId: OWNER, orgId: OTHER_ORG }, book1, e0);
  check("another organization can't hand out the job's walkbook", !otherAssign.ok && /not found/.test(otherAssign.reason), otherAssign);

  // Jurisdiction hard stop.
  await p.jurisdictionProfile.update({ where: { id: seeded.jurisdictionId }, data: { isCurrent: false } });
  const frozen = await assignWalkbook(owner, book1, e0);
  await p.jurisdictionProfile.update({ where: { id: seeded.jurisdictionId }, data: { isCurrent: true } });
  check("a superseded jurisdiction freezes handing out walkbooks, with the reason", !frozen.ok && /frozen/.test(frozen.reason), frozen);

  const a1 = await assignWalkbook(owner, book1, e0);
  const same = await assignWalkbook(owner, book1, e0);
  check("a hired worker gets book 1; handing it to them again changes nothing", a1.ok && a1.changed && same.ok && !same.changed, { a1, same });
  check("the worker sees book 1 with its stops, and nothing else", JSON.stringify((await loadWorkerWalkbooks(W[0])).map((b) => [b.number, b.stops.length])) === "[[1,2]]");
  check("the other worker sees nothing", (await loadWorkerWalkbooks(W[1])).length === 0);

  // Concurrent hand-offs leave one clear holder.
  await Promise.all([assignWalkbook(owner, book2, e0), assignWalkbook(owner, book2, e1)]);
  const holders2 = (await loadJobWalkbooks(ORG, job.id))!.books.find((b) => b.id === book2)!.holder;
  const seen0 = (await loadWorkerWalkbooks(W[0])).some((b) => b.id === book2);
  const seen1 = (await loadWorkerWalkbooks(W[1])).some((b) => b.id === book2);
  check("two hand-offs at once: exactly one worker holds book 2", !!holders2 && seen0 !== seen1, { holders2, seen0, seen1 });

  // The same race with the id in upper case on one side: the lock is keyed on the id as the database has it.
  await assignWalkbook(owner, book2, "");
  const mixed = await Promise.all([assignWalkbook(owner, book2.toUpperCase(), e0), assignWalkbook(owner, book2, e1.toUpperCase())]);
  const rows2 = await p.walkbookAssignment.findMany({ where: { walkbookId: book2 }, orderBy: { createdAt: "asc" } });
  const times = rows2.map((r) => r.createdAt.getTime());
  check("…and in mixed case: both go through one lock, each row strictly after the one before", mixed.every((m) => m.ok) && times.every((t, i) => i === 0 || t > times[i - 1]), { mixed, times });
  check("a hand-off with no worker field at all takes the book back instead of failing", (await assignWalkbook(owner, book2, undefined)).ok);

  const moved = await assignWalkbook(owner, book1, e1);
  check("handing book 1 to someone else moves it", moved.ok && !(await loadWorkerWalkbooks(W[0])).some((b) => b.id === book1) && (await loadWorkerWalkbooks(W[1])).some((b) => b.id === book1));
  const back = await assignWalkbook(owner, book1, "");
  check("taking book 1 back leaves it with nobody", back.ok && (await loadJobWalkbooks(ORG, job.id))!.books.find((b) => b.id === book1)!.holder === null && !(await loadWorkerWalkbooks(W[1])).some((b) => b.id === book1));
  const hist = await loadWalkbookForStaff(ORG, book1);
  check("the history keeps every hand-off, newest first", hist?.history.map((h) => h.name ?? "nobody").length === 3 && hist.history[0].name === null, hist?.history);
  check("each hand-off is audited", (await p.auditEvent.count({ where: { entityId: book1, action: { in: ["walkbook.assigned", "walkbook.returned"] } } })) === 3);

  // Append-only: the database refuses edits to the history.
  const row = await p.walkbookAssignment.findFirstOrThrow({ where: { walkbookId: book1 } });
  let refusedUpdate = false;
  let refusedDelete = false;
  try { await p.walkbookAssignment.update({ where: { id: row.id }, data: { engagementId: null } }); } catch { refusedUpdate = true; }
  try { await p.walkbookAssignment.delete({ where: { id: row.id } }); } catch { refusedDelete = true; }
  check("the database refuses to change or delete who held a walkbook", refusedUpdate && refusedDelete);

  // A worker who is no longer hired stops seeing the book they hold.
  await assignWalkbook(owner, book1, e0);
  await p.engagement.update({ where: { id: e0 }, data: { status: "CANCELLED" } });
  check("a cancelled engagement sees no walkbooks", (await loadWorkerWalkbooks(W[0])).length === 0);
  const stale = (await loadJobWalkbooks(ORG, job.id))!.books.find((b) => b.id === book1)!.holder;
  check("staff see the holder is no longer hired", stale?.stillHired === false, stale);

  const imp2 = await importAddresses(owner, META, FILE.replace(/Elm St/g, "Oak St").replace(/Ash Ave/g, "Fir Ave"));
  const racing = imp2.ok ? await Promise.all([cutWalkbooks(owner, job.id.toUpperCase(), imp2.importId, "1"), cutWalkbooks(owner, job.id, imp2.importId, "1")]) : [];
  const after = await p.walkbook.findMany({ where: { jobId: job.id }, orderBy: { number: "asc" } });
  check("two cuts at once (one id in upper case): one cuts, the other finds nothing left; numbers carry on, no gaps", racing.filter((r) => r.ok).length === 1 && after.map((b) => b.number).join(",") === "1,2,3,4,5,6", { racing, n: after.map((b) => b.number) });

  // The same file imported twice: its doors are already on the job's books, so nothing new is cut.
  const dup = await importAddresses(owner, META, FILE);
  const dupCut = dup.ok ? await cutWalkbooks(owner, job.id, dup.importId, "2") : null;
  const dupLeft = dup.ok ? (await loadJobWalkbooks(ORG, job.id))!.imports.find((i) => i.id === dup.importId)?.unassigned : -1;
  check("…and the page doesn't offer that import as having anything left to cut", dupLeft === 0, dupLeft);
  check("the same doors from a second import aren't put on a second walkbook", !!dupCut && !dupCut.ok && /already on one/.test(dupCut.reason), dupCut);
  const mixedFile = FILE + "\nV6,New,Person,DEM,7 Ash Ave,,Denver,CO,80202,Y,,,";
  const part = await importAddresses(owner, META, mixedFile);
  const partCut = part.ok ? await cutWalkbooks(owner, job.id, part.importId, "50") : null;
  check("…and a file with one new door cuts just that one, counting the repeats", !!partCut && partCut.ok && partCut.stops === 1 && partCut.repeats === 4, partCut);


  // --- The stored columns never reach a screen; the export carries the record ID ---
  await assignWalkbook(owner, book2, e1);
  const b2stops = (await loadWalkbookForStaff(ORG, book2))!.stops;
  const worker1 = { workerId: W[1], profileId: W[1] };
  await recordStopOutcome(worker1, b2stops[0].id, randomUUID(), { outcome: "DONE" });
  const NAMES = /\b(Ada|Lovelace|Alan|Turing|Grace|Hopper|Linus|DEM|REP|UNA|LIB|V1|V2|V3|V4|123-45-6789)\b/;
  const screens = JSON.stringify([await loadWorkerWalkbooks(W[1]), await loadWalkbookForStaff(ORG, book2), await loadJobWalkbooks(ORG, job.id), (await loadConsole(ORG, job.id, parseConsoleQuery({})))!.stops]);
  check("no name, party, record ID or vote history is on a worker's page, a staff walkbook, the job page or the console", !NAMES.test(screens) && screens.includes("Elm St"), screens.match(NAMES)?.[0]);
  const ex = await loadExportRows(ORG, job.id, { outcome: null, bookId: null, holderId: null });
  const csv = ex.ok ? exportCsv(ex.rows, ex.pollColumns) : "";
  check("the staff export carries each stop's source record ID (to match a return file), and no name or party", ex.ok && /"V[1-4]"/.test(csv) && !/Ada|Lovelace|Turing|Hopper|DEM|REP/.test(csv) && csv.split("\r\n")[0].includes("Source record ID"), csv.split("\r\n").slice(0, 2));

  // --- Deleting names and addresses ---
  const before = { stops: await p.walkbookStop.count(), outcomes: await p.stopOutcome.count(), rows: await p.importedAddress.count({ where: { importId } }) };
  const stopIds = (await p.walkbookStop.findMany({ select: { id: true } })).map((x) => x.id);
  check("before deleting: the file's four addresses are stored", before.rows === 4, before);
  check("another organization can't delete the file's data, and a bad id is 'not found'", !(await purgeOwnImport({ profileId: OWNER, orgId: OTHER_ORG }, importId)).ok && !(await purgeOwnImport(owner, "nope")).ok);
  // The planner's samples of the table (pg_stats) hold the file's values too, once the table is analyzed.
  const sampled = () => inspect(() => p.$queryRawUnsafe<Array<{ v: string | null }>>(`SELECT concat(most_common_vals::text, ' ', histogram_bounds::text) AS v FROM pg_stats WHERE tablename = 'ImportedAddress'`)).then((r) => r.map((x) => x.v ?? "").join(" "));
  await inspect(() => p.$executeRawUnsafe(`ANALYZE "public"."ImportedAddress"`));
  check("the planner's samples of the table hold the file's names before it is deleted (so the purge has to clear them)", /Lovelace/.test(await sampled()));
  check("…and reading them is refused outside the scope, though the query names no table", await Promise.resolve().then(() => p.$queryRaw`SELECT most_common_vals::text FROM pg_stats WHERE tablename LIKE ${"Imported%"}`).then(() => false, (e: Error) => e.name === "VoterDataGuardError"));
  const lastAnalyzed = () => p.$queryRaw<Array<{ at: Date | null }>>`SELECT last_analyze AS at FROM pg_stat_user_tables WHERE relname = ${"Imported" + "Address"}`.then((r) => r[0]?.at?.getTime() ?? 0);
  const purgeStarted = Date.now();
  const purged = await purgeOwnImport(owner, importId);
  check("the organization deletes a file's names and addresses on request: four addresses go", purged.ok && purged.addresses === 4 && !purged.already, purged);
  check("every address row of the file is gone, and with it every record ID and column", (await p.importedAddress.count({ where: { importId } })) === 0);
  // Another file in this suite has the same names, so the proof is the refresh itself: analyzed after the purge began.
  check("…and the planner's samples of them too: the purge refreshes the table's statistics", (await lastAnalyzed()) >= purgeStarted);
  const afterP = { stops: await p.walkbookStop.count(), outcomes: await p.stopOutcome.count() };
  check("the stops and their outcomes all stay (the stops' addresses are just empty)", afterP.stops === before.stops && afterP.outcomes === before.outcomes && (await p.walkbookStop.count({ where: { addressId: null } })) >= 4, afterP);
  const imp1 = await inspect(() => p.addressImport.findUniqueOrThrow({ where: { id: importId } }));
  check("the file says when its data was deleted", imp1.purgedAt !== null);
  const pa = await p.auditEvent.findFirst({ where: { entityId: importId, action: "address_import.purged" } });
  check("the deletion is audited with its reason and the count, never what was in it", !!pa && (pa.metadata as { reason?: string; addresses?: number }).reason === "requested" && (pa.metadata as { addresses?: number }).addresses === 4 && !NAMES.test(JSON.stringify(pa.metadata)), pa?.metadata);
  const staffAfter = (await loadWalkbookForStaff(ORG, book2))!.stops;
  const workerAfter = (await loadWorkerWalkbooks(W[1])).find((b) => b.id === book2)!.stops;
  check("a stop with no address still lists, for staff and for the worker, with its number and its outcome", staffAfter.length === b2stops.length && staffAfter.every((st) => st.purged && st.line1 === "") && workerAfter.every((st) => st.purged) && staffAfter[0].result.outcome === "DONE");
  const consoleAfter = (await loadConsole(ORG, job.id, parseConsoleQuery({ book: book2 })))!;
  check("the console lists them too, as deleted, with the outcome and holder kept", consoleAfter.stops.length === b2stops.length && consoleAfter.stops.every((st) => st.purged) && consoleAfter.stops[0].result.outcome === "DONE");
  const exAfter = await loadExportRows(ORG, job.id, { outcome: null, bookId: book2, holderId: null });
  check("the export of a deleted book has the stop and its outcome, with no address and no record ID", exAfter.ok && exAfter.rows.length === b2stops.length && exAfter.rows.every((r) => r.line1 === "" && r.sourceRecordId === null) && exAfter.rows[0].outcome === "DONE", exAfter.ok ? exAfter.rows[0] : exAfter);
  check("deleting again is a no-op that says so", await purgeOwnImport(owner, importId).then((r) => r.ok && r.already && r.addresses === 0));
  const cutPurged = await cutWalkbooks(owner, job.id, importId, "2");
  check("a deleted file can't be cut again; the reason says to import it again", !cutPurged.ok && /deleted/.test(cutPurged.reason), cutPurged);
  check("the job page lists the file as deleted, with nothing left to cut", (await loadJobWalkbooks(ORG, job.id))!.imports.find((i) => i.id === importId)?.purgedAt !== null && (await loadJobWalkbooks(ORG, job.id))!.imports.find((i) => i.id === importId)?.unassigned === 0);

  // --- The 30 days running out, and the jobs closing ---
  const old = imp2.ok ? imp2.importId : "";
  await p.addressImport.update({ select: { id: true }, where: { id: old }, data: { createdAt: new Date(Date.now() - 31 * 86_400_000), deleteAfter: new Date(Date.now() - 86_400_000) } });
  const due1 = await purgeDueImports();
  check("an import whose 30 days are up is deleted by the daily run (and only that one: the job is still open)", due1.purged === 1 && (await p.importedAddress.count({ where: { importId: old } })) === 0 && (await p.addressImport.findUniqueOrThrow({ where: { id: old }, select: { purgedAt: true } })).purgedAt !== null && (await p.importedAddress.count({ where: { importId: part.ok ? part.importId : "" } })) > 0, due1);
  const expiredAudit = await p.auditEvent.findFirst({ where: { entityId: old, action: "address_import.purged" } });
  check("…audited as expired, with no user", (expiredAudit?.metadata as { reason?: string })?.reason === "expired" && expiredAudit?.actorId === null);
  check("running it again finds nothing", (await purgeDueImports()).purged === 0);
  await p.job.update({ where: { id: job.id }, data: { status: "CLOSED" } });
  check("a file whose jobs just closed is kept for the 7-day grace", (await purgeDueImports()).purged === 0 && (await p.importedAddress.count({ where: { importId: part.ok ? part.importId : "" } })) > 0);
  const partId = part.ok ? part.importId : "";
  const kept = async () => (await purgeDueImports()).purged === 0 && (await p.importedAddress.count({ where: { importId: partId } })) > 0;
  // The books are old from here on, so each check below turns on the job alone.
  await p.$executeRaw`UPDATE "Walkbook" SET "createdAt" = now() - interval '9 days' WHERE "importId" = ${partId}::uuid`;
  // Closed means hiring has closed; the people already hired keep walking. Only a job whose end date has also passed is over.
  await p.$executeRaw`UPDATE "Job" SET "endsAt" = NULL, "updatedAt" = now() - interval '8 days' WHERE "id" = ${job.id}::uuid`;
  check("a job closed over a week ago with no end date keeps its file (the 30 days still apply)", await kept());
  await p.$executeRaw`UPDATE "Job" SET "endsAt" = now() + interval '10 days', "updatedAt" = now() - interval '8 days' WHERE "id" = ${job.id}::uuid`;
  check("…and so does a closed job that is still running to its end date", await kept());
  await p.$executeRaw`UPDATE "Job" SET "endsAt" = now() - interval '3 days', "updatedAt" = now() - interval '8 days' WHERE "id" = ${job.id}::uuid`;
  check("…and one that ended inside the 7-day grace", await kept());
  await p.$executeRaw`UPDATE "Job" SET "startsAt" = now() - interval '40 days', "endsAt" = now() - interval '8 days', "updatedAt" = now() - interval '8 days' WHERE "id" = ${job.id}::uuid`;
  await p.$executeRaw`UPDATE "Walkbook" SET "createdAt" = now() WHERE "importId" = ${partId}::uuid`;
  check("…and one that ended long enough ago, while a book was cut from the file this week", await kept());
  await p.$executeRaw`UPDATE "Walkbook" SET "createdAt" = now() - interval '9 days' WHERE "importId" = ${partId}::uuid`;
  const due2 = await purgeDueImports();
  const closedAudit = await p.auditEvent.findFirst({ where: { entityId: part.ok ? part.importId : "", action: "address_import.purged" } });
  check("when every job a file was cut for is closed and ended over a week ago, its data goes at the next run", due2.purged >= 1 && (await p.importedAddress.count({ where: { importId: part.ok ? part.importId : "" } })) === 0 && (closedAudit?.metadata as { reason?: string })?.reason === "jobs_closed", due2);
  check("a file that was never cut for a job keeps its 30 days (the Arizona file was only imported)", (await p.addressImport.count({ where: { purgedAt: null, walkbooks: { none: {} } } })) >= 1);
  check("through all of it no stop and no outcome was deleted", (await p.walkbookStop.count({ where: { id: { in: stopIds } } })) === stopIds.length && (await p.stopOutcome.count()) === before.outcomes);

  // --- The runtime guard (voter-data-guard): through db() itself, not a scan of source text ---
  const refused = (q: () => PromiseLike<unknown>) => Promise.resolve().then(q).then(() => false, (e: Error) => e.name === "VoterDataGuardError");
  const built = { select: { id: true, sourceData: true } }; // a select built elsewhere and passed in
  check("the guard refuses a select built elsewhere, outside the importer, purge and export", await refused(() => p.importedAddress.findMany(built)));
  check("…a key computed at run time", await refused(() => p.importedAddress.findFirst({ select: { [["source", "RecordId"].join("")]: true } as never })));
  check("…a whole row, at the top or through a relation", (await refused(() => p.importedAddress.findFirst({}))) && (await refused(() => p.walkbookStop.findFirst({ include: { address: true } }))));
  check("…raw SQL naming a column or reading the table whole, inside a transaction too", (await refused(() => p.$queryRaw`SELECT ia."sourceRecordId" FROM "ImportedAddress" ia LIMIT 1`)) && (await refused(() => p.$transaction(async (tx) => tx.$queryRaw`SELECT * FROM "ImportedAddress" LIMIT 1`))));
  check("…while the address itself (what a walkbook is for) still reads", !(await refused(() => p.walkbookStop.findFirst({ select: { address: { select: { line1: true, zip: true } } } }))));
  check("inside withVoterData the same reads go through, a lazy query and a transaction included", !(await refused(() => withVoterData("acceptance check", () => p.importedAddress.findMany(built)))) && !(await refused(() => withVoterData("acceptance check", () => p.$transaction(async (tx) => tx.$queryRaw`SELECT ia."sourceRecordId" FROM "ImportedAddress" ia LIMIT 1`)))));

  // Work started inside the scope that runs after it closes (a timer) is refused: the scope ends with its query.
  const later = await new Promise<boolean>((resolve) => {
    void withVoterData("acceptance check", async () => {
      setTimeout(() => void refused(() => p.importedAddress.findFirst({})).then(resolve), 20);
    });
  });
  check("…and closes when its work is done: a timer it started is refused later", later);
  check("…raw SQL that names nothing protected but reads a row whole is refused too", (await refused(() => p.$queryRaw`SELECT concat(ia) AS r FROM "ImportedAddress" ia LIMIT 1`)) && (await refused(() => p.$queryRaw`SELECT query_to_xml(${'SELECT 1'}, true, false, '')::text AS x`)));

  await p.$disconnect();
  if (fails) { console.log(`${fails} failed`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
