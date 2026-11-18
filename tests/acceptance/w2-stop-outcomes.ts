/* W2 acceptance checks: stop outcomes on real Postgres. Only the worker holding a book can record on it; the newest row of a stop is its state; the database is append-only and accepts only the closed set of fields; a taken-back book stops accepting outcomes; a double tap records once; progress counts Come back as still open; a book carries its state to the next holder (tests/acceptance/run.sh). */
import { randomUUID } from "node:crypto";
import { credentialed } from "./credentialed";
import { db } from "@/lib/db";
import { createJob, publishJob } from "@/lib/jobs-data";
import { validateJob } from "@/lib/jobs";
import { claimJob } from "@/lib/engagements-data";
import { assignWalkbook, cutWalkbooks, importAddresses, loadJobWalkbooks, loadWalkbookForStaff, loadWorkerWalkbooks } from "@/lib/walkbooks-data";
import { recordStopOutcome } from "@/lib/stop-outcomes-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const W = ["00000000-0000-0000-0000-000000000101", "00000000-0000-0000-0000-000000000102", "00000000-0000-0000-0000-000000000103"];
const JOB = "00000000-0000-0000-0000-000000000011";
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };

const FILE = ["address,city,state,zip", "1 Elm St,Denver,CO,80202", "3 Elm St,Denver,CO,80202", "5 Elm St,Denver,CO,80202", "7 Elm St,Denver,CO,80202"].join("\n");
const META = { fileName: "a.csv", recordSource: "Supporter list", purpose: "Canvassing", license: "Own list", authorized: "on" };

async function makeJob(type: "CANVASS" | "PETITION", title: string) {
  const p = db();
  const seeded = await p.job.findUniqueOrThrow({ where: { id: JOB } });
  const year = new Date().getUTCFullYear() + 1;
  const v = validateJob({
    type, title, jurisdictionId: seeded.jurisdictionId, startsAt: `${year}-03-01`, endsAt: `${year}-04-01`, city: "Denver", state: "CO",
    compensationMethod: "HOURLY", payRate: "24", headcount: "40", hiringModes: ["instant_claim"], campaignType: "ballot_measure", affiliation: "nonpartisan",
    message: "Talk to voters.", contactEmergency: "a", contactDisputes: "b", contactLostMaterials: "c", launchMode: "SELF",
  });
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  const job = await createJob(ORG, OWNER, v.value);
  if (!(await publishJob(job.id, ORG, OWNER)).ok) throw new Error("publish");
  return job;
}

(async () => {
  const p = db();
  // Hiring checks credentials: these workers hold the circulator set a petition job asks for.
  await credentialed(p, W);
  await p.profile.createMany({ data: [{ id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" }] });
  await p.organization.update({ where: { id: ORG }, data: { approved: true, contractorTermsSignedAt: new Date(), classificationReviewedAt: new Date() } });
  const owner = { profileId: OWNER, orgId: ORG };
  const canvass = await makeJob("CANVASS", "Canvass book");
  const petition = await makeJob("PETITION", "Petition book");
  const imp = await importAddresses(owner, META, FILE);
  const importId = imp.ok ? imp.importId : "";
  await cutWalkbooks(owner, canvass.id, importId, "4");
  await cutWalkbooks(owner, petition.id, importId, "4");
  const hire = async (w: string, jobId: string) => { const r = await claimJob(w, w, jobId); return r.ok ? r.engagementId : ""; };
  const e0 = await hire(W[0], canvass.id), e1 = await hire(W[1], canvass.id), pe0 = await hire(W[0], petition.id);
  const bookOf = async (jobId: string) => (await loadJobWalkbooks(ORG, jobId))!.books[0].id;
  const cbook = await bookOf(canvass.id), pbook = await bookOf(petition.id);
  await assignWalkbook(owner, cbook, e0);
  await assignWalkbook(owner, pbook, pe0);
  const actor = (i: number) => ({ workerId: W[i], profileId: W[i] });
  const stops = async (book: string) => (await loadWalkbookForStaff(ORG, book))!.stops;
  const [c1, c2, c3, c4] = await stops(cbook);
  const [p1, p2] = await stops(pbook);

  // --- Who may record ---
  const stranger = await recordStopOutcome(actor(1), c1.id, randomUUID(), { outcome: "DONE" });
  check("a worker hired on the job but not holding the book can't record on it, and learns nothing", !stranger.ok && /not found/.test(stranger.reason), stranger);
  const noSuch = await recordStopOutcome(actor(0), randomUUID(), randomUUID(), { outcome: "DONE" });
  check("an unknown stop is 'not found' too", !noSuch.ok && /not found/.test(noSuch.reason), noSuch);
  const badId = await recordStopOutcome(actor(0), c1.id, "nope", { outcome: "DONE" });
  check("a missing device id is refused", !badId.ok, badId);
  const crossJob = await recordStopOutcome(actor(0), p1.id, randomUUID(), { outcome: "DONE", signatures: "1" });
  check("…and the holder of the petition book can record there (their own book)", crossJob.ok, crossJob);

  // --- Recording, per work type ---
  const done = await recordStopOutcome(actor(0), c1.id, randomUUID(), { outcome: "DONE", talked_to: "on", note: "he likes X" });
  check("the holder records a Done with fields", done.ok, done);
  const lit = await recordStopOutcome(actor(0), c2.id, randomUUID(), { outcome: "NOT_HOME", left_literature: "on", talked_to: "on" });
  check("a lit drop: Not home with literature left", lit.ok, lit);
  const refused = await recordStopOutcome(actor(0), c3.id, randomUUID(), { outcome: "DO_NOT_KNOCK" });
  check("Don't knock records", refused.ok, refused);
  const bad = await recordStopOutcome(actor(0), c4.id, randomUUID(), { outcome: "SUPPORTER" });
  check("an outcome outside the code is refused", !bad.ok, bad);
  const sig = await recordStopOutcome(actor(0), p2.id, randomUUID(), { outcome: "DONE", signatures: "51" });
  check("a petition count over the limit is refused with a field error", !sig.ok && !!sig.errors?.signatures, sig);
  const sigOk = await recordStopOutcome(actor(0), p2.id, randomUUID(), { outcome: "DONE", signatures: "4", left_literature: "on" });
  check("a petition Done records signatures", sigOk.ok, sigOk);

  const answersOf = async (stopId: string) => (await p.stopOutcomeAnswer.findMany({ where: { outcome: { stopId } }, orderBy: { key: "asc" } })).map((r) => `${r.key}:${r.intValue ?? r.boolValue}`).join(",");
  check("a canvass Done stores exactly talked_to and left_literature", (await answersOf(c1.id)) === "left_literature:false,talked_to:true", await answersOf(c1.id));
  check("a Not home stores only left_literature: 'talked to' isn't recorded there", (await answersOf(c2.id)) === "left_literature:true", await answersOf(c2.id));
  check("a petition Done stores only signatures: no literature field on a petition", (await answersOf(p2.id)) === "signatures:4", await answersOf(p2.id));
  check("no text from the form reached the database", !JSON.stringify(await p.stopOutcome.findMany({ include: { answers: true } })).includes("likes X"));

  // --- The database's own limits ---
  let refusedKey = false;
  try { await p.$executeRawUnsafe(`INSERT INTO "StopOutcomeAnswer" (id, "outcomeId", key, "intValue") VALUES (gen_random_uuid(), '${done.ok ? (await p.stopOutcome.findFirstOrThrow({ where: { stopId: c1.id } })).id : ""}', 'opinion', 1)`); } catch { refusedKey = true; }
  check("the database refuses any field key outside the closed set (no recorded opinion)", refusedKey);
  const first = await p.stopOutcome.findFirstOrThrow({ where: { stopId: c1.id } });
  let upd = false, del = false;
  try { await p.stopOutcome.update({ where: { id: first.id }, data: { outcome: "REFUSED" } }); } catch { upd = true; }
  try { await p.stopOutcome.delete({ where: { id: first.id } }); } catch { del = true; }
  check("the database refuses to change or delete an outcome", upd && del);

  // --- Idempotence and correction ---
  const id = randomUUID();
  const taps = await Promise.all([1, 2, 3].map(() => recordStopOutcome(actor(0), c4.id, id, { outcome: "COME_BACK" })));
  check("three taps with one device id record once", taps.every((t) => t.ok) && (await p.stopOutcome.count({ where: { id } })) === 1 && taps.filter((t) => t.ok && t.repeated).length === 2, taps);
  const reuse = await recordStopOutcome(actor(0), c1.id, id, { outcome: "DONE" });
  check("a device id already used for another stop is refused", !reuse.ok, reuse);
  const fixed = await recordStopOutcome(actor(0), c1.id, randomUUID(), { outcome: "COME_BACK" });
  const sc = await stops(cbook);
  check("a correction is a new row and the newest wins: stop 1 is Come back now, with the earlier Done kept", fixed.ok && sc[0].result.outcome === "COME_BACK" && (await p.stopOutcome.count({ where: { stopId: c1.id } })) === 2, sc[0].result);
  check("an outcome never ties with the one before it, even in the same instant", await (async () => {
    const t = new Date();
    await recordStopOutcome(actor(0), c3.id, randomUUID(), { outcome: "DONE" }, t);
    await recordStopOutcome(actor(0), c3.id, randomUUID(), { outcome: "COME_BACK" }, t);
    await recordStopOutcome(actor(0), c3.id, randomUUID(), { outcome: "NOT_HOME" }, t);
    const rs = (await p.stopOutcome.findMany({ where: { stopId: c3.id }, orderBy: { createdAt: "asc" } })).map((r) => r.createdAt.getTime());
    return rs.every((x, i) => i === 0 || x > rs[i - 1]) && (await stops(cbook))[2].result.outcome === "NOT_HOME";
  })());

  let noValue = false;
  try { await p.$executeRawUnsafe(`INSERT INTO "StopOutcomeAnswer" (id, "outcomeId", key) VALUES (gen_random_uuid(), '${first.id}', 'signatures')`); } catch { noValue = true; }
  check("the database refuses a signatures answer with no number (no NULL hole in the closed set)", noValue);
  // --- Progress ---
  const page = (await loadJobWalkbooks(ORG, canvass.id))!;
  const prog = page.books[0].progress;
  check("progress: stops 2 and 3 are Not home, 1 and 4 are Come back: two settled, two still open", prog.total === 4 && prog.byKind.NOT_HOME === 2 && prog.byKind.COME_BACK === 2 && prog.remaining === 2 && prog.settled === 2, prog);
  const pp = (await loadJobWalkbooks(ORG, petition.id))!.books[0].progress;
  check("petition progress adds up signatures across its Done stops (1 + 4)", pp.signatures === 5 && pp.byKind.DONE === 2, pp);

  // --- The worker's own view, and a take-back ---
  const mine = await loadWorkerWalkbooks(W[0], canvass.id);
  check("the worker's book carries each stop's state", mine[0]?.stops[0].result.outcome === "COME_BACK" && mine[0].stops[1].result.outcome === "NOT_HOME", mine[0]?.stops.map((s) => s.result.outcome));
  await assignWalkbook(owner, cbook, "");
  const afterTakeBack = await recordStopOutcome(actor(0), c1.id, randomUUID(), { outcome: "DONE" });
  check("once the book is taken back its old holder can't record on it, and is told it is gone (not to retry)", !afterTakeBack.ok && /not found/.test(afterTakeBack.reason) && afterTakeBack.gone === true, afterTakeBack);
  await assignWalkbook(owner, cbook, e1);
  const next = await loadWorkerWalkbooks(W[1], canvass.id);
  check("the next holder sees the book's state: Come back stops are still open for them", next[0]?.stops[0].result.outcome === "COME_BACK");
  const theirs = await recordStopOutcome(actor(1), c1.id, randomUUID(), { outcome: "DONE", talked_to: "on" });
  check("…and can record on it", theirs.ok, theirs);

  // The same device id on two books at once: one records, the other is refused cleanly (no 500).
  const sharedId = randomUUID();
  const [pa, pb] = [(await stops(pbook))[2], (await stops(cbook))[1]];
  const race = await Promise.all([recordStopOutcome(actor(0), pa.id, sharedId, { outcome: "COME_BACK" }), recordStopOutcome(actor(1), pb.id, sharedId, { outcome: "COME_BACK" })]);
  check("one device id used on two books at once: one saves, the other is refused in words", race.filter((r) => r.ok).length === 1 && race.every((r) => r.ok || /try again/i.test(r.reason)), race);

  // --- A closed account and a cancelled engagement can't record ---
  await p.engagement.update({ where: { id: e1 }, data: { status: "CANCELLED" } });
  const cancelled = await recordStopOutcome(actor(1), c2.id, randomUUID(), { outcome: "DONE" });
  check("a worker no longer hired can't record", !cancelled.ok, cancelled);

  await p.$disconnect();
  if (fails) { console.log(`${fails} failed`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
