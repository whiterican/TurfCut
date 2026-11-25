/* W5 acceptance checks: polling at the door on real Postgres. Only the worker holding the book records, and only on a Done stop; an edit is a new row and the newest wins; staff edits are their own rows; a worker reads back only what their own engagement recorded; questions are append-only and a change supersedes; the database accepts only a choice of the answer's own question and has no free-text column; org isolation on every read (tests/acceptance/run.sh). */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createJob, publishJob } from "@/lib/jobs-data";
import { validateJob } from "@/lib/jobs";
import { claimJob } from "@/lib/engagements-data";
import { assignWalkbook, cutWalkbooks, importAddresses, loadJobWalkbooks, loadWalkbookForStaff } from "@/lib/walkbooks-data";
import { recordStopOutcome } from "@/lib/stop-outcomes-data";
import { POLL_BY_WORKER_REFUSAL, exportProblem, loadExportRows } from "@/lib/stop-console-data";
import { exportCsv } from "@/lib/stop-console";
import { auditPollRead, addPollQuestion, changePollQuestion, loadCurrentPolls, loadNewestJobAnswers, loadPollResults, loadPollSetup, loadStopPollHistory, loadWorkerPollAnswers, loadWorkerPollLocks, recordPollAnswers, staffRecordPollAnswers } from "@/lib/poll-data";
import { loadWorkerWalkbookList, loadWorkerWalkbooks } from "@/lib/walkbooks-worker-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const OTHER_ORG = "00000000-0000-0000-0000-0000000000ff";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const W = ["00000000-0000-0000-0000-000000000101", "00000000-0000-0000-0000-000000000102"];
const JOB = "00000000-0000-0000-0000-000000000011";
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const FILE = ["address,city,state,zip", "1 Elm St,Denver,CO,80202", "3 Elm St,Denver,CO,80202", "5 Elm St,Denver,CO,80202", "7 Elm St,Denver,CO,80202"].join("\n");
const META = { fileName: "a.csv", recordSource: "Own list", purpose: "Polling", license: "Own list", authorized: "on" };

async function makeJob(type: "CANVASS" | "PETITION", title: string) {
  const seeded = await db().job.findUniqueOrThrow({ where: { id: JOB } });
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
  await p.profile.createMany({ data: [{ id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" }] });
  await p.organization.update({ where: { id: ORG }, data: { approved: true, contractorTermsSignedAt: new Date(), classificationReviewedAt: new Date() } });
  await p.organization.create({ data: { id: OTHER_ORG, name: "Other org" } });
  const owner = { profileId: OWNER, orgId: ORG };
  const job = await makeJob("CANVASS", "Poll job");
  const petition = await makeJob("PETITION", "Petition job");
  const imp = await importAddresses(owner, META, FILE);
  await cutWalkbooks(owner, job.id, imp.ok ? imp.importId : "", "10");
  const e0 = await claimJob(W[0], W[0], job.id), e1 = await claimJob(W[1], W[1], job.id);
  const book = (await loadJobWalkbooks(ORG, job.id))!.books[0].id;
  await assignWalkbook(owner, book, e0.ok ? e0.engagementId : "");
  const [s1, s2, s3] = (await loadWalkbookForStaff(ORG, book))!.stops;
  const actor = (i: number) => ({ workerId: W[i], profileId: W[i] });
  await recordStopOutcome(actor(0), s1.id, randomUUID(), { outcome: "DONE" });
  await recordStopOutcome(actor(0), s2.id, randomUUID(), { outcome: "DONE" });
  await recordStopOutcome(actor(0), s3.id, randomUUID(), { outcome: "NOT_HOME" });

  // --- Setting up the poll ---
  const q1 = await addPollQuestion(owner, job.id, { prompt: "Do you support Measure 3?", choices: "Support\nOppose\nUndecided" });
  const q2 = await addPollQuestion(owner, job.id, { prompt: "Top issue?", choices: "Housing\nTransit" });
  check("an organization adds two questions to a canvass job", q1.ok && q2.ok, [q1, q2]);
  check("a petition job can't have a poll", !(await addPollQuestion(owner, petition.id, { prompt: "Q", choices: "a\nb" })).ok);
  check("another organization can't add to the job's poll", !(await addPollQuestion({ profileId: OWNER, orgId: OTHER_ORG }, job.id, { prompt: "Q", choices: "a\nb" })).ok);
  const one = await addPollQuestion(owner, job.id, { prompt: "Q", choices: "only one" });
  check("a question needs two or more choices, in words", !one.ok && !!one.errors?.choices, one);
  const setup = (await loadPollSetup(ORG, job.id))!;
  check("the poll lists its questions in order with their choices", setup.current.map((q) => `${q.position}:${q.prompt}:${q.choices.length}`).join("|") === "1:Do you support Measure 3?:3|2:Top issue?:2", setup.current);
  check("another organization can't read the poll setup", (await loadPollSetup(OTHER_ORG, job.id)) === null);
  const Q1 = setup.current[0], Q2 = setup.current[1];
  const ch = (q: typeof Q1, label: string) => q.choices.find((c) => c.label === label)!.id;
  const form = (a: Record<string, string>) => Object.fromEntries(Object.entries(a).map(([k, v]) => [`q_${k}`, v]));

  // --- Who may record ---
  const stranger = await recordPollAnswers(actor(1), s1.id, randomUUID(), form({ [Q1.id]: ch(Q1, "Support") }));
  check("a hired worker who doesn't hold the book can't record, and learns nothing", !stranger.ok && stranger.gone === true, stranger);
  const notDone = await recordPollAnswers(actor(0), s3.id, randomUUID(), form({ [Q1.id]: ch(Q1, "Support") }));
  check("a poll is asked at a Done door: a Not home stop is refused in words", !notDone.ok && /Done/.test(notDone.reason), notDone);
  const foreign = await recordPollAnswers(actor(0), s1.id, randomUUID(), form({ [Q1.id]: ch(Q2, "Housing") }));
  check("a choice of another question is refused", !foreign.ok, foreign);
  check("a form with no answer is refused", !(await recordPollAnswers(actor(0), s1.id, randomUUID(), {})).ok);

  // --- Recording and idempotence ---
  const id = randomUUID();
  const taps = await Promise.all([1, 2, 3].map(() => recordPollAnswers(actor(0), s1.id, id, form({ [Q1.id]: ch(Q1, "Support"), [Q2.id]: ch(Q2, "Transit") }))));
  check("three taps with one device id record once: two rows", taps.every((t) => t.ok) && (await p.pollAnswer.count({ where: { stopId: s1.id } })) === 2 && taps.filter((t) => t.ok && t.repeated).length === 2, taps);
  const dec = await recordPollAnswers(actor(0), s2.id, randomUUID(), form({ [Q1.id]: "declined" }));
  check("a resident who declined is recorded as declined, with no choice", dec.ok && (await p.pollAnswer.findFirstOrThrow({ where: { stopId: s2.id } })).declined === true);

  // --- Editing: a new row, the newest wins, and the history stays ---
  const edit = await recordPollAnswers(actor(0), s1.id, randomUUID(), form({ [Q1.id]: ch(Q1, "Oppose"), [Q2.id]: ch(Q2, "Transit") }));
  check("editing one answer adds one row (the unchanged one adds none)", edit.ok && edit.saved === 1 && (await p.pollAnswer.count({ where: { stopId: s1.id } })) === 3, edit);
  const same = await recordPollAnswers(actor(0), s1.id, randomUUID(), form({ [Q1.id]: ch(Q1, "Oppose"), [Q2.id]: ch(Q2, "Transit") }));
  check("saving the same answers again adds nothing to the history", same.ok && same.saved === 0 && (await p.pollAnswer.count({ where: { stopId: s1.id } })) === 3, same);
  const mine = (await loadWorkerPollAnswers(W[0], [s1.id])).get(s1.id)!;
  check("the worker reads back their newest answers: Oppose and Transit", mine.length === 2 && mine.find((a) => a.questionId === Q1.id)?.choiceId === ch(Q1, "Oppose"), mine);
  const first = await p.pollAnswer.findFirstOrThrow({ where: { stopId: s1.id, questionId: Q1.id }, orderBy: { createdAt: "asc" } });
  let upd = false, del = false;
  try { await p.pollAnswer.update({ where: { id: first.id }, data: { declined: true } }); } catch { upd = true; }
  try { await p.pollAnswer.delete({ where: { id: first.id } }); } catch { del = true; }
  check("the database refuses to change or delete a recorded answer", upd && del);

  // --- Staff edits are their own rows ---
  const staff = await staffRecordPollAnswers(owner, s1.id, form({ [Q1.id]: ch(Q1, "Undecided") }));
  check("staff edit an answer: a new row with no engagement, by the staff profile", staff.ok && (await p.pollAnswer.findFirstOrThrow({ where: { stopId: s1.id, questionId: Q1.id }, orderBy: { createdAt: "desc" } })).engagementId === null);
  const hist = (await loadStopPollHistory(ORG, s1.id, job.id))!;
  check("the staff history lists every row newest first with who gave it: Staff, then the worker's edit, then the first answer", hist.history.filter((h) => h.questionId === Q1.id).map((h) => h.by).join(",") === "Staff,Alex Rivera,Alex Rivera", hist.history.map((h) => h.by));
  const myAfter = (await loadWorkerPollAnswers(W[0], [s1.id])).get(s1.id)!;
  check("the worker still reads only their own rows: Oppose, not the staff's Undecided", myAfter.find((a) => a.questionId === Q1.id)?.choiceId === ch(Q1, "Oppose"), myAfter);
  // What the worker's own page is served: the staff-changed question is marked as someone else's (never with the answer), their older answer to it is not
  // shown as the answer now, and the question they still own is unchanged, so saving it is not refused because of the other.
  const e0Id = e0.ok ? e0.engagementId : "";
  const locks = await loadWorkerPollLocks(new Map([[s1.id, e0Id], [s2.id, e0Id]]));
  check("the worker's page is told which question someone else answered, and nothing about questions they own", locks.has(`${s1.id}|${Q1.id}`) && !locks.has(`${s1.id}|${Q2.id}`) && [...locks].every((k) => k.startsWith(s1.id)), [...locks]);
  const pageStop = (await loadWorkerWalkbooks(W[0])).flatMap((b) => b.stops).find((s) => s.id === s1.id)!;
  check("…their older answer to it is left off the page, the question is listed as locked, and the one they own stays", !pageStop.poll.some((a) => a.questionId === Q1.id) && pageStop.pollLocked.join() === Q1.id && pageStop.poll.some((a) => a.questionId === Q2.id) && pageStop.pollMine === true, pageStop);
  check("…and nothing on the page says what the staff answer is", !JSON.stringify(pageStop).includes(ch(Q1, "Undecided")), pageStop);
  const onlyMine = await recordPollAnswers(actor(0), s1.id, randomUUID(), form({ [Q2.id]: ch(Q2, "Housing") }));
  check("the worker can still change the question they own on that door", onlyMine.ok && onlyMine.saved === 1, onlyMine);
  await recordPollAnswers(actor(0), s1.id, randomUUID(), form({ [Q2.id]: ch(Q2, "Transit") }));
  const list = await loadWorkerWalkbookList(W[0], job.id);
  check("the shift page's list is book names and stop counts only", list.length === 1 && list[0].stops === 4 && Object.keys(list[0]).sort().join() === "id,name,stops", list);
  const res = (await loadPollResults(ORG, job.id))!;
  check("results count each stop's newest answer once: Q1 has Undecided 1 and Declined 1 (stop 1's edits count once)", res.current[0].total === 2 && res.current[0].declined === 1 && res.current[0].choices.find((c) => c.label === "Undecided")!.n === 1 && res.current[0].choices.find((c) => c.label === "Oppose")!.n === 0, res.current[0]);
  check("…and Q2 has Transit 1", res.current[1].total === 1 && res.current[1].choices.find((c) => c.label === "Transit")!.n === 1, res.current[1]);
  check("another organization sees no results, history or staff edit", (await loadPollResults(OTHER_ORG, job.id)) === null && (await loadStopPollHistory(OTHER_ORG, s1.id, job.id)) === null && !(await staffRecordPollAnswers({ profileId: OWNER, orgId: OTHER_ORG }, s1.id, form({ [Q1.id]: ch(Q1, "Support") })).then((r) => r.ok)));
  check("the history is scoped to the job: the same stop under another job id is not found", (await loadStopPollHistory(ORG, s1.id, petition.id)) === null);
  check("the newest answers of the job, for the export, are the stop's current ones", (await loadNewestJobAnswers(ORG, job.id, [s1.id])).get(`${s1.id}|${Q1.id}`)?.choiceId === ch(Q1, "Undecided"));
  check("…and that lookup is scoped: another organization, a bad job id or no stops gets nothing", (await loadNewestJobAnswers(OTHER_ORG, job.id, [s1.id])).size === 0 && (await loadNewestJobAnswers(ORG, "nope", [s1.id])).size === 0 && (await loadNewestJobAnswers(ORG, job.id, [])).size === 0);

  // --- Changing a question supersedes it ---
  const changed = await changePollQuestion(owner, Q1.id, { prompt: "Do you support Measure 3 (revised)?", choices: "Yes\nNo\nUnsure" });
  check("changing a question adds a new one at the same position", changed.ok, changed);
  const [c1, c2] = await Promise.all([changePollQuestion(owner, Q2.id, { prompt: "Top issue (a)?", choices: "A\nB" }), changePollQuestion(owner, Q2.id, { prompt: "Top issue (b)?", choices: "C\nD" })]);
  check("two changes to one question at once: one wins, the other is told it was already changed", [c1, c2].filter((c) => c.ok).length === 1 && [c1, c2].some((c) => !c.ok && /already changed/.test(c.reason)), [c1, c2]);
  const after = (await loadPollSetup(ORG, job.id))!;
  check("the poll now lists the new wording, and keeps the old as earlier wording", after.current.length === 2 && after.current[0].prompt.includes("revised") && after.earlier.length === 2, after);
  check("answers given to the old question stay with it", (await p.pollAnswer.count({ where: { questionId: Q1.id } })) === 4 && (await loadPollResults(ORG, job.id))!.earlier.length === 2);
  check("a changed question keeps its position, so the order doesn't move", after.current.map((q) => q.position).join(",") === "1,2");
  check("the worker's form now carries the new questions only", (await loadCurrentPolls([job.id])).get(job.id)!.every((q) => !Q1.id.includes(q.id)) && (await loadCurrentPolls([job.id])).get(job.id)![0].prompt.includes("revised"));
  const newQ = after.current[0];
  const q2Now = after.current[1];
  const rowsBefore = await p.pollAnswer.count({ where: { stopId: s1.id } });
  const oldQ = await recordPollAnswers(actor(0), s1.id, randomUUID(), form({ [Q1.id]: ch(Q1, "Support"), [newQ.id]: newQ.choices[1].id }));
  check("a stale form (it answers a question that has since changed) is refused whole, with 'reload': the valid answer on it is not half-saved", !oldQ.ok && /changed/.test(oldQ.reason) && (await p.pollAnswer.count({ where: { stopId: s1.id } })) === rowsBefore, oldQ);
  check("an answer to the new question records", (await recordPollAnswers(actor(0), s1.id, randomUUID(), form({ [newQ.id]: newQ.choices[0].id }))).ok);
  // A retry after a partial save: this tap saved one row (the other answer was unchanged), then the stop changed, then the retry arrives.
  const tapId = randomUUID();
  const partial = await recordPollAnswers(actor(0), s1.id, tapId, form({ [newQ.id]: newQ.choices[0].id, [q2Now.id]: q2Now.choices[0].id }));
  await recordPollAnswers(actor(0), s1.id, randomUUID(), form({ [q2Now.id]: q2Now.choices[1].id }));
  const retry = await recordPollAnswers(actor(0), s1.id, tapId, form({ [newQ.id]: newQ.choices[0].id, [q2Now.id]: q2Now.choices[0].id }));
  check("a retry of a tap that saved only some of its rows is a replay, not an error", partial.ok && partial.saved === 1 && retry.ok && retry.repeated === true, [partial, retry]);
  let blank = false;
  try { await p.$executeRawUnsafe(`UPDATE "PollQuestion" SET prompt = 'x' WHERE id = '${Q1.id}'`); } catch { blank = true; }
  check("the database refuses to edit a question in place", blank);

  // --- The database's own limits ---
  const target = await p.pollAnswer.findFirstOrThrow({ where: { stopId: s1.id } });
  const stmt = (choice: string | null, declined: boolean, question = Q1.id) => p.$executeRawUnsafe(`INSERT INTO "PollAnswer" (id, "stopId", "questionId", "choiceId", declined, "recordedById") VALUES (gen_random_uuid(), '${target.stopId}', '${question}', ${choice ? `'${choice}'` : "NULL"}, ${declined}, '${OWNER}')`);
  const refusedBoth = await stmt(ch(Q1, "Support"), true).then(() => false, () => true);
  const refusedNeither = await stmt(null, false).then(() => false, () => true);
  const refusedForeign = await stmt(ch(Q2, "Housing"), false, Q1.id).then(() => false, () => true);
  check("the database refuses a row with both a choice and 'declined', or neither", refusedBoth && refusedNeither);
  check("the database refuses a choice that belongs to another question", refusedForeign);
  const cols = await p.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'PollAnswer' AND data_type IN ('text', 'character varying')`);
  check("PollAnswer has no free-text column at all", cols.length === 0, cols);
  const grants = await p.$queryRawUnsafe<Array<{ grantee: string }>>(`SELECT grantee FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name IN ('PollQuestion','PollChoice','PollAnswer') AND grantee IN ('anon', 'authenticated')`);
  check("all three tables are server-only: no grant to the API roles", grants.length === 0, grants);

  // --- A take-back, and a hand-on, move access with the book ---
  await assignWalkbook(owner, book, "");
  const afterTakeBack = await recordPollAnswers(actor(0), s2.id, randomUUID(), form({ [newQ.id]: newQ.choices[1].id }));
  check("after the book is taken back its old holder can't record or edit", !afterTakeBack.ok && afterTakeBack.gone === true, afterTakeBack);
  await assignWalkbook(owner, book, e1.ok ? e1.engagementId : "");
  check("the next holder reads none of the first worker's answers", ((await loadWorkerPollAnswers(W[1], [s1.id, s2.id])).size) === 0);
  const inherited = (await loadWorkerWalkbooks(W[1])).flatMap((b) => b.stops).filter((s) => s.id === s1.id || s.id === s2.id);
  check("the next holder's page doesn't offer the poll at a Done door they inherited", inherited.length === 2 && inherited.every((s) => s.result.outcome === "DONE" && s.pollMine === false && s.poll.length === 0), inherited);
  check("…nor tells their phone which questions someone else answered there, before they have been to the door", inherited.every((s) => s.pollLocked.length === 0) && (await p.pollAnswer.count({ where: { stopId: s1.id, questionId: newQ.id } })) > 0, inherited);
  const notTheirs = await recordPollAnswers(actor(1), s2.id, randomUUID(), form({ [newQ.id]: newQ.choices[1].id }));
  check("a new holder can't poll a door they never recorded as Done: a hand-on carries the state, not the visit", !notTheirs.ok && /Done/.test(notTheirs.reason), notTheirs);
  await recordStopOutcome(actor(1), s2.id, randomUUID(), { outcome: "DONE" });
  const theirs = await recordPollAnswers(actor(1), s2.id, randomUUID(), form({ [newQ.id]: newQ.choices[1].id }));
  check("…once they record it Done themselves they can, and it reads back to them", theirs.ok && (await loadWorkerPollAnswers(W[1], [s2.id])).get(s2.id)?.length === 1, theirs);
  check("…and their page offers it there from then on", (await loadWorkerWalkbooks(W[1])).flatMap((b) => b.stops).find((s) => s.id === s2.id)?.pollMine === true);
  await recordStopOutcome(actor(1), s1.id, randomUUID(), { outcome: "DONE" });
  const guess = await recordPollAnswers(actor(1), s1.id, randomUUID(), form({ [newQ.id]: newQ.choices[0].id }));
  const blind = await recordPollAnswers(actor(1), s1.id, randomUUID(), form({ [newQ.id]: newQ.choices[1].id }));
  const answerNow = (await loadNewestJobAnswers(ORG, job.id, [s1.id])).get(`${s1.id}|${newQ.id}`)?.choiceId;
  check("a worker can't overwrite, or probe by guessing, an answer someone else recorded: both refused alike, the answer unchanged", !guess.ok && !blind.ok && guess.reason === blind.reason && answerNow === newQ.choices[0].id, [guess, blind, answerNow]);
  const allLocked = (await loadWorkerWalkbooks(W[1])).flatMap((b) => b.stops).find((s) => s.id === s1.id)!;
  check("…and their page says so: the door is theirs now, that question is someone else's, and no answer is on the page", allLocked.pollMine === true && allLocked.pollLocked.includes(newQ.id) && !allLocked.poll.some((a) => a.questionId === newQ.id) && !JSON.stringify(allLocked).includes(newQ.choices[0].id), allLocked);
  const viaStaff = await staffRecordPollAnswers(owner, s1.id, form({ [newQ.id]: newQ.choices[1].id }));
  check("staff change it, and that is a row of its own", viaStaff.ok && viaStaff.saved === 1);
  await p.engagement.update({ where: { id: e1.ok ? e1.engagementId : "" }, data: { status: "CANCELLED" } });
  check("a worker no longer hired reads nothing back, and can't record", (await loadWorkerPollAnswers(W[1], [s1.id, s2.id])).size === 0 && !(await recordPollAnswers(actor(1), s2.id, randomUUID(), form({ [newQ.id]: newQ.choices[0].id }))).ok);

  // --- Reading is audited, once per window; the export carries no worker name ---
  const t0 = new Date();
  await auditPollRead(owner, job.id, "results", undefined, t0);
  await auditPollRead(owner, job.id, "results", undefined, new Date(t0.getTime() + 60_000));
  await auditPollRead(owner, job.id, "stop_history", s1.id, new Date(t0.getTime() + 61_000));
  await auditPollRead(owner, job.id, "stop_history", s2.id, new Date(t0.getTime() + 62_000));
  await auditPollRead(owner, job.id, "results", undefined, new Date(t0.getTime() + 11 * 60_000));
  check("reads are audited once per actor, job, kind and stop in ten minutes (two results reads a minute apart are one row; another stop is its own; eleven minutes later is a new one)", (await p.auditEvent.count({ where: { action: "poll.answers_read", entityId: job.id } })) === 4, await p.auditEvent.count({ where: { action: "poll.answers_read" } }));
  const ex = await loadExportRows(ORG, job.id, { outcome: null, bookId: null, holderId: null }, true);
  if (ex.ok) {
    const csv = exportCsv(ex.rows, ex.pollColumns);
    check("the export has a column per current question, answers in words", ex.pollColumns.length === 2 && /Poll 1: /.test(csv.split("\r\n")[0]), csv.split("\r\n")[0]);
    check("…and no worker name, no 'Held by' and no time beside the opinions", !/Held by|Recorded at|Alex Rivera|Jordan Blake/.test(csv), csv.split("\r\n").slice(0, 2));
  } else check("the export loads", false, ex);
  const noPoll = await loadExportRows(ORG, job.id, { outcome: null, bookId: null, holderId: null }, false);
  check("without poll access the export has no poll columns", noPoll.ok && noPoll.pollColumns.length === 0);
  // A poll export is never narrowed to one worker (rule 5): it is refused. (The walkbook column still allows a join: WALKBOOKS.md.)
  const oneWorker = { outcome: null, bookId: null, holderId: e1.ok ? e1.engagementId : "" };
  const byWorker = await loadExportRows(ORG, job.id, oneWorker, true);
  check("a poll export narrowed to one worker is refused, with the reason", !byWorker.ok && byWorker.reason === POLL_BY_WORKER_REFUSAL, byWorker);
  check("…and the route's preflight refuses it before an export is counted", (await exportProblem(ORG, job.id, oneWorker, true)) === POLL_BY_WORKER_REFUSAL);

  // A poll is a tool on canvass jobs. A job whose type changed (a draft can) keeps its questions but has no poll.
  await p.$executeRaw`UPDATE "Job" SET "type" = 'PETITION' WHERE "id" = ${job.id}::uuid`;
  const qNow = (await loadCurrentPolls([job.id])).get(job.id) ?? [];
  check("a job that is no longer a canvass job offers no poll to anyone", qNow.length === 0, qNow.length);
  const onPetition = await staffRecordPollAnswers(owner, s1.id, form({ [newQ.id]: newQ.choices[0].id }));
  check("…and an answer can't be recorded on it", !onPetition.ok && /no poll/.test(onPetition.reason), onPetition);
  await p.$executeRaw`UPDATE "Job" SET "type" = 'CANVASS' WHERE "id" = ${job.id}::uuid`;
  check("'Held by nobody' is not a worker: still exported", (await loadExportRows(ORG, job.id, { outcome: null, bookId: null, holderId: "none" }, true)).ok);
  check("without poll columns the worker filter still works", (await loadExportRows(ORG, job.id, oneWorker, false)).ok);

  await p.$disconnect();
  if (fails) { console.log(`${fails} failed`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
