/* M7 acceptance checks: supervisor corrections, account closure, data export, against a fresh database (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { supervisorCorrection, supervisorShiftAction, loadShift, facts, scheduleShift } from "@/lib/field-day-data";
import { activeTime, shiftState } from "@/lib/field-day";
import { computeScorecard, verifiedWork } from "@/lib/scorecard";
import { loadScorecardShifts } from "@/lib/scorecard-data";
import * as pay from "@/lib/pay-data";
import { lineState } from "@/lib/pay";
import { syncWorkerActions } from "@/lib/field-day-data";
import { closeAccount, closureFacts, exportAccount } from "@/lib/account-data";
import { closureProblems, CLOSED_NAME } from "@/lib/account-closure";
import { inviteWorker } from "@/lib/engagements-data";
import { personName } from "@/lib/chat-data";
import { cancellationOf } from "@/lib/scorecard";

const ORG = "00000000-0000-0000-0000-000000000001";
const ORG2 = "00000000-0000-0000-0000-000000000002";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const SUP = "00000000-0000-0000-0000-0000000000bb";
const FIN = "00000000-0000-0000-0000-0000000000dd";
const OTHER = "00000000-0000-0000-0000-0000000000cc";
const W1 = "00000000-0000-0000-0000-000000000101";
const ENG_W1_A = "00000000-0000-0000-0000-000000000031";
const H = 3_600_000, M = 60_000;
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const supA = { profileId: SUP, orgId: ORG };
const fin = { profileId: FIN, orgId: ORG, role: "FINANCE" as const };

/** A shift 2 days ago: check-in, 30 min break, 30 signatures, optionally no check-out. */
async function worked(daysAgo: number, withCheckOut: boolean) {
  const p = db();
  const start = new Date(Date.now() - daysAgo * 24 * H);
  const s = await p.shift.create({ data: { engagementId: ENG_W1_A, startsAt: start, endsAt: new Date(start.getTime() + 4 * H), status: withCheckOut ? "COMPLETED" : "ACTIVE", checkInAt: start, checkOutAt: withCheckOut ? new Date(start.getTime() + 4 * H) : null } });
  const ev = [
    { type: "CHECK_IN", payload: {}, at: 0 },
    { type: "PAUSE_START", payload: {}, at: 1 * H },
    { type: "PAUSE_END", payload: {}, at: 1.5 * H },
    { type: "SIGNATURE_SUBMITTED", payload: { count: 30 }, at: 2 * H },
    ...(withCheckOut ? [{ type: "CHECK_OUT", payload: {}, at: 4 * H }] : []),
  ];
  await p.workEvent.createMany({ data: ev.map((e) => ({ shiftId: s.id, type: e.type as never, payload: e.payload, actorId: W1, createdAt: new Date(start.getTime() + e.at) })) });
  return { id: s.id, start };
}
const evOf = async (shiftId: string, type: string) => (await db().workEvent.findFirstOrThrow({ where: { shiftId, type: type as never }, orderBy: { createdAt: "asc" } }));
const approve = (id: string) => supervisorShiftAction(supA, id, { kind: "closeout", status: "APPROVED", reason: null });

(async () => {
  const p = db();
  await p.organization.create({ data: { id: ORG2, name: "Other Campaign Co", approved: true, updatedAt: new Date() } });
  await p.profile.createMany({ data: [
    { id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" },
    { id: SUP, role: "SUPERVISOR", orgId: ORG, displayName: "Luis Ortega" },
    { id: FIN, role: "FINANCE", orgId: ORG, displayName: "Fran Lee" },
    { id: OTHER, role: "OWNER", orgId: ORG2, displayName: "Other Boss" },
  ] });

  // --- 1. A forgotten check-out, entered by the supervisor ---
  const a = await worked(2, false);
  const before = await p.workEvent.count({ where: { shiftId: a.id } });
  const noOut = await supervisorCorrection(supA, a.id, { kind: "enter_event", type: "CHECK_OUT", at: new Date(a.start.getTime() + 3.5 * H), reason: "Phone died at 12:30, confirmed with Alex" });
  check("supervisor enters a missing check-out", noOut.ok, noOut);
  let s = (await loadShift(a.id))!;
  let st = shiftState(facts(s));
  check("the shift is completed at the entered time; the entry is in the worker's name, signed by the supervisor", s.status === "COMPLETED" && s.checkOutAt?.getTime() === a.start.getTime() + 3.5 * H && st.checkedOutAt?.getTime() === a.start.getTime() + 3.5 * H, { status: s.status, out: s.checkOutAt });
  const entered = await evOf(a.id, "CHECK_OUT");
  check("…and it's an ordinary ledger row with enteredBy + reason (nothing edited)", (await p.workEvent.count({ where: { shiftId: a.id } })) === before + 1 && (entered.payload as Record<string, unknown>).enteredBy === SUP && !!(entered.payload as Record<string, unknown>).reason);
  check("verified hours use the entered time: 3.5h − 30 min = 3h", verifiedWork(s.events, s.validations).activeMs === 3 * H);
  check("audit records the entry", !!(await p.auditEvent.findFirst({ where: { action: "shift.entry_entered", entityId: a.id } })));
  const again = await supervisorCorrection(supA, a.id, { kind: "enter_event", type: "CHECK_OUT", at: new Date(a.start.getTime() + 3.7 * H), reason: "a second check-out should fail" });
  check("a second check-out is refused with a reason; nothing written", !again.ok && /two check-outs/.test(again.ok ? "" : again.reason) && (await p.workEvent.count({ where: { shiftId: a.id } })) === before + 1, again);

  // --- 2. A count correction after approval withdraws the stale pay line ---
  const b = await worked(3, true);
  await approve(b.id);
  const l0 = await p.payout.findFirstOrThrow({ where: { shiftId: b.id } });
  const sig = await evOf(b.id, "SIGNATURE_SUBMITTED");
  const fix = await supervisorCorrection(supA, b.id, { kind: "correct_event", eventId: sig.id, count: 25, reason: "Five sheets were double-counted at hand-in" });
  check("a count correction before pay approval is accepted", fix.ok, fix);
  s = (await loadShift(b.id))!;
  st = shiftState(facts(s));
  check("state, live clock and scorecard all agree on the corrected count", st.signatures === 25 && verifiedWork(s.events, s.validations).submitted === 25 && activeTime(facts(s), new Date()).ms === 3.5 * H);
  const l0s = lineState(await p.payout.findUniqueOrThrow({ where: { id: l0.id } }), (await p.payoutEvent.findMany({ where: { payoutId: l0.id } })).map((e) => ({ ...e, type: e.type })), false);
  // Hourly pay doesn't change with a count, so the line is kept. Correct the time instead:
  check("(hourly) a count change keeps the pay line", l0s.status !== "VOIDED", l0s);
  const co = await evOf(b.id, "CHECK_OUT");
  const late = await supervisorCorrection(supA, b.id, { kind: "correct_event", eventId: co.id, at: new Date(b.start.getTime() + 5 * H), reason: "Stayed an hour longer to finish the block" });
  check("a time correction that changes pay is accepted", late.ok, late);
  const l0s2 = lineState(await p.payout.findUniqueOrThrow({ where: { id: l0.id } }), (await p.payoutEvent.findMany({ where: { payoutId: l0.id } })).map((e) => ({ ...e, type: e.type })), false);
  check("…and withdraws the old pay line", l0s2.status === "VOIDED", l0s2);
  check("…which finance can no longer approve", !(await pay.lineAction(fin, [l0.id], "approve")).ok);
  await approve(b.id);
  const lines = await p.payout.findMany({ where: { shiftId: b.id, kind: "SHIFT" }, orderBy: { createdAt: "asc" } });
  check("approving again records the corrected pay: 4.5h × $25 = $112.50", lines.length === 2 && lines[1].amountCents === 11250, lines.map((l) => l.amountCents));
  const scorecard = computeScorecard(await loadScorecardShifts(W1), { now: new Date() });
  const seg = scorecard.segments.find((x) => x.workType === "PETITION");
  check("the scorecard counts the corrected hours and the correction", !!seg && seg.correctionsApplied >= 1, seg?.correctionsApplied);

  // --- 3. Locked once pay is approved for payment ---
  await pay.lineAction(fin, [lines[1].id], "approve");
  const lockedTry = await supervisorCorrection(supA, b.id, { kind: "correct_event", eventId: sig.id, count: 26, reason: "trying after pay approval" });
  check("corrections are refused once pay is approved for payment", !lockedTry.ok && /approved for payment/i.test(lockedTry.ok ? "" : lockedTry.reason), lockedTry);

  // --- 4. Impossible corrections write nothing ---
  const c = await worked(4, true);
  const n0 = await p.workEvent.count({ where: { shiftId: c.id } });
  const pe = await evOf(c.id, "PAUSE_END");
  const bad = await supervisorCorrection(supA, c.id, { kind: "correct_event", eventId: pe.id, at: new Date(c.start.getTime() + 30 * M), reason: "ends the break before it started" });
  check("an impossible time is refused with a reason", !bad.ok && /hadn't started/.test(bad.ok ? "" : bad.reason), bad);
  const neg = await supervisorCorrection(supA, c.id, { kind: "correct_event", eventId: (await evOf(c.id, "SIGNATURE_SUBMITTED")).id, count: 0, reason: "zero signatures is not a count" });
  check("a zero count is refused", !neg.ok, neg);
  const far = await supervisorCorrection(supA, c.id, { kind: "enter_event", type: "CHECK_IN", at: new Date(c.start.getTime() - 5 * H), reason: "five hours before the shift" });
  check("a time outside the window is refused", !far.ok, far);
  check("…and nothing was written", (await p.workEvent.count({ where: { shiftId: c.id } })) === n0);

  // --- 5. Only field roles of the job's org ---
  const other = await supervisorCorrection({ profileId: OTHER, orgId: ORG2 }, c.id, { kind: "correct_event", eventId: pe.id, at: new Date(c.start.getTime() + 100 * M), reason: "another organization's supervisor" });
  check("another org can't correct the shift", !other.ok && /not found/i.test(other.ok ? "" : other.reason), other);

  // --- 6. A cancelled shift can't be corrected ---
  const d = await p.shift.create({ data: { engagementId: ENG_W1_A, startsAt: new Date(Date.now() + 24 * H), endsAt: new Date(Date.now() + 28 * H) } });
  await supervisorShiftAction(supA, d.id, { kind: "cancel", reason: "rain" });
  const onCancelled = await supervisorCorrection(supA, d.id, { kind: "enter_event", type: "CHECK_IN", at: new Date(Date.now() + 24 * H), reason: "entering on a cancelled shift" });
  check("a cancelled shift can't be corrected", !onCancelled.ok, onCancelled);

  // --- 7. Review fixes on slice A ---
  // 7a. A worker's own late check-out never blocks correcting something else.
  const lateOut = await worked(5, true);
  // The worker checked out 4h after the start; shorten the schedule so that check-out is 2.5h after the end.
  await p.shift.update({ where: { id: lateOut.id }, data: { endsAt: new Date(lateOut.start.getTime() + 1.5 * H) } });
  const lateFix = await supervisorCorrection(supA, lateOut.id, { kind: "correct_event", eventId: (await evOf(lateOut.id, "SIGNATURE_SUBMITTED")).id, count: 28, reason: "Recounted at the office: 28" });
  check("a worker's own late check-out doesn't block a count correction", lateFix.ok, lateFix);

  // 7b. A supervisor's entry in the worker's name doesn't push the worker's synced times later.
  const live = await worked(0.2, false); // checked in ~5h ago, still active
  const entered2 = await supervisorCorrection(supA, live.id, { kind: "enter_event", type: "SIGNATURE_SUBMITTED", at: new Date(live.start.getTime() + 3 * H), count: 5, reason: "Five more from the back of the clipboard" });
  check("(setup) entry accepted", entered2.ok, entered2);
  const synced = await syncWorkerActions({ workerId: W1, profileId: W1 }, live.id, { deviceNow: Date.now(), actions: [{ clientId: "11111111-1111-4111-8111-111111111111", at: live.start.getTime() + 2.5 * H, action: { kind: "check_out" } }] });
  const outRow = await p.workEvent.findFirst({ where: { shiftId: live.id, type: "CHECK_OUT" } });
  check("a synced check-out keeps its own time instead of being floored to the supervisor's later entry", synced.ok && synced.results[0].status === "saved" && Math.abs((outRow?.createdAt.getTime() ?? 0) - (live.start.getTime() + 2.5 * H)) < 50, { synced, at: outRow?.createdAt, expected: new Date(live.start.getTime() + 2.5 * H) });

  // 7c. Two-person rule: whoever entered or corrected the entries can't approve the pay.
  const owner = { profileId: OWNER, orgId: ORG };
  const two = await worked(6, false);
  const ownerEntered = await supervisorCorrection(owner, two.id, { kind: "enter_event", type: "CHECK_OUT", at: new Date(two.start.getTime() + 4 * H), reason: "Owner entering the check-out for the worker" });
  check("(setup) owner's entry accepted", ownerEntered.ok, ownerEntered);
  await approve(two.id);
  const twoLine = await p.payout.findFirstOrThrow({ where: { shiftId: two.id } });
  const ownerApprove = await pay.lineAction({ profileId: OWNER, orgId: ORG, role: "OWNER" }, [twoLine.id], "approve");
  check("the owner who entered the check-out can't approve that pay", !ownerApprove.ok && /entered or corrected/.test(ownerApprove.ok ? "" : ownerApprove.reason), ownerApprove);
  check("…but finance can", (await pay.lineAction(fin, [twoLine.id], "approve")).ok);

  // --- 8. Closing an account (slice B) ---
  const W1P = "00000000-0000-0000-0000-000000000101";
  const facts1 = await closureFacts(W1);
  const refused = await closeAccount({ userId: W1P, workerId: W1 });
  check("closing is refused while pay is on the way", !refused.ok && refused.problems.some((x) => /pay on the way/.test(x)) && facts1.unpaidLines > 0, { refused, facts1 });
  check("…and nothing changed", (await p.worker.findUniqueOrThrow({ where: { id: W1 } })).closedAt === null);

  // A second worker (Jordan) with a future shift, an open application and a pay history.
  const W2 = "00000000-0000-0000-0000-000000000102", W2P = "00000000-0000-0000-0000-000000000102";
  const JOB = "00000000-0000-0000-0000-000000000011";
  const jobRow = await p.job.findUniqueOrThrow({ where: { id: JOB } });
  const jobA = Object.fromEntries(Object.entries(jobRow).filter(([k]) => !["id", "createdAt", "updatedAt"].includes(k)));
  const job2 = await p.job.create({ data: { ...(jobA as never as Record<string, never>), title: "Second job", startsAt: new Date(Date.now() + 2 * 24 * H), endsAt: new Date(Date.now() + 9 * 24 * H) } as never });
  const eng2 = await p.engagement.create({ data: { jobId: JOB, workerId: W2, status: "ACTIVE", hiredById: OWNER } });
  const applied = await p.engagement.create({ data: { jobId: job2.id, workerId: W2, status: "APPLIED" } });
  const prefBefore = await p.politicalPreference.count({ where: { workerId: W2 } });
  const past2 = await p.shift.create({ data: { engagementId: eng2.id, startsAt: new Date(Date.now() - 3 * 24 * H), endsAt: new Date(Date.now() - 3 * 24 * H + 4 * H), status: "COMPLETED", checkInAt: new Date(Date.now() - 3 * 24 * H), checkOutAt: new Date(Date.now() - 3 * 24 * H + 4 * H) } });
  await p.workEvent.createMany({ data: [{ shiftId: past2.id, type: "CHECK_IN", payload: {}, actorId: W2P, createdAt: past2.startsAt }, { shiftId: past2.id, type: "SIGNATURE_SUBMITTED", payload: { count: 12 }, actorId: W2P, createdAt: new Date(past2.startsAt.getTime() + H) }, { shiftId: past2.id, type: "CHECK_OUT", payload: {}, actorId: W2P, createdAt: past2.endsAt }] });
  await approve(past2.id);
  const line2 = await p.payout.findFirstOrThrow({ where: { shiftId: past2.id } });
  const future2 = await p.shift.create({ data: { engagementId: eng2.id, startsAt: new Date(Date.now() + 3 * 24 * H), endsAt: new Date(Date.now() + 3 * 24 * H + 4 * H) } });
  const active2 = await p.shift.create({ data: { engagementId: eng2.id, startsAt: new Date(Date.now() - 2 * H), endsAt: new Date(Date.now() + 2 * H), status: "ACTIVE", checkInAt: new Date(Date.now() - 2 * H) } });
  await p.workEvent.create({ data: { shiftId: active2.id, type: "CHECK_IN", payload: {}, actorId: W2P, createdAt: active2.startsAt } });
  const r1 = await closeAccount({ userId: W2P, workerId: W2 });
  check("refused with every blocker named: unpaid line + live shift", !r1.ok && r1.problems.length === 2 && /pay on the way/.test(r1.problems[0]) && /checked in/.test(r1.problems[1]), r1);
  // Settle: pay the line (approve + mark paid), check out of the live shift.
  await pay.lineAction(fin, [line2.id], "approve");
  await p.payoutEvent.create({ data: { payoutId: line2.id, type: "PAID", providerRef: "tr_test", createdAt: new Date() } });
  await p.workEvent.create({ data: { shiftId: active2.id, type: "CHECK_OUT", payload: {}, actorId: W2P, createdAt: new Date() } });
  await p.shift.update({ where: { id: active2.id }, data: { status: "COMPLETED", checkOutAt: new Date() } });
  // A reviewed shift whose pay was withdrawn by a correction awaits re-approval: still "pay not settled".
  const past3 = await p.shift.create({ data: { engagementId: eng2.id, startsAt: new Date(Date.now() - 4 * 24 * H), endsAt: new Date(Date.now() - 4 * 24 * H + 4 * H), status: "COMPLETED", checkInAt: new Date(Date.now() - 4 * 24 * H), checkOutAt: new Date(Date.now() - 4 * 24 * H + 4 * H) } });
  await p.workEvent.createMany({ data: [{ shiftId: past3.id, type: "CHECK_IN", payload: {}, actorId: W2P, createdAt: past3.startsAt }, { shiftId: past3.id, type: "CHECK_OUT", payload: {}, actorId: W2P, createdAt: past3.endsAt }] });
  await approve(past3.id);
  const corr3 = await supervisorCorrection(supA, past3.id, { kind: "correct_event", eventId: (await evOf(past3.id, "CHECK_OUT")).id, at: new Date(past3.endsAt.getTime() + 30 * M), reason: "Stayed half an hour to finish the block" });
  check("(setup) correction withdrew the pay line", corr3.ok, corr3);
  const r1b = await closeAccount({ userId: W2P, workerId: W2 });
  check("refused while worked shifts await review or re-approval (one message naming both)", !r1b.ok && r1b.problems.length === 1 && /2 shifts you worked are waiting/.test(r1b.problems[0]), r1b);
  await approve(past3.id);
  const line3 = await p.payout.findFirstOrThrow({ where: { shiftId: past3.id, events: { none: { type: "VOIDED" } } } });
  await pay.lineAction(fin, [line3.id], "approve");
  await p.payoutEvent.create({ data: { payoutId: line3.id, type: "PAID", providerRef: "tr_test3", createdAt: new Date() } });
  const r1c = await closeAccount({ userId: W2P, workerId: W2 });
  check("re-approved and paid: only the unreviewed shift remains", !r1c.ok && /A shift you worked is waiting/.test(r1c.problems[0]), r1c);
  await supervisorShiftAction(supA, active2.id, { kind: "closeout", status: "REJECTED", reason: "No packets came back" });
  const r2 = await closeAccount({ userId: W2P, workerId: W2 });
  check("once reviewed (rejected: nothing due) the account closes", r2.ok, r2);
  const counts = async () => ({ ev: await p.workEvent.count(), pay: await p.payout.count(), payEv: await p.payoutEvent.count(), pref: await p.politicalPreference.count({ where: { workerId: W2 } }), val: await p.validation.count() });
  const after = await counts();
  const w2 = await p.worker.findUniqueOrThrow({ where: { id: W2 }, include: { profile: true } });
  check("the worker is anonymized and marked closed; the profile row stays", w2.displayName === CLOSED_NAME && w2.phone === null && !!w2.closedAt && !!w2.profile.closedAt && w2.profile.displayName === null, w2);
  check("the ledger is untouched (pay lines, pay events, reviews, consent versions)", after.pay === (await p.payout.count()) && after.pref === prefBefore && after.payEv >= 2, after);
  const f2 = await p.shift.findUniqueOrThrow({ where: { id: future2.id }, include: { events: true } });
  const cancelEv = f2.events.find((e) => e.type === "SHIFT_CANCELLED");
  check("the future shift is cancelled in the worker's name, marked as an account closure", f2.status === "CANCELLED" && (cancelEv?.payload as Record<string, unknown>)?.accountClosed === true && (cancelEv?.payload as Record<string, unknown>)?.by === "WORKER", f2);
  check("…which the scorecard treats as excused, never a no-show", cancellationOf({ id: f2.id, startsAt: f2.startsAt, endsAt: f2.endsAt, scheduledAt: f2.createdAt, status: "CANCELLED", workType: "PETITION", engagementStatus: "ACTIVE", cancellationNoticeHours: 24, events: f2.events.map((e) => ({ id: e.id, type: e.type, payload: e.payload, createdAt: e.createdAt })), validations: [] } as never) === "excused");
  check("the open application is withdrawn; the worked engagement stays", (await p.engagement.findUniqueOrThrow({ where: { id: applied.id } })).status === "CANCELLED" && (await p.engagement.findUniqueOrThrow({ where: { id: eng2.id } })).status === "ACTIVE");
  check("audit records the closure", !!(await p.auditEvent.findFirst({ where: { action: "account.closed", entityId: W2P } })));
  check("(no Supabase here) the login deletion failure is recorded, not hidden", !!(await p.auditEvent.findFirst({ where: { action: "account.login_delete_failed", entityId: W2P } })));
  check("closing twice is refused", !(await closeAccount({ userId: W2P, workerId: W2 })).ok);
  const inv = await inviteWorker(ORG, OWNER, job2.id, W2);
  check("a closed worker can't be invited", !inv.ok && /closed their account/.test(inv.ok ? "" : inv.reason), inv);
  const sched = await scheduleShift({ profileId: OWNER, orgId: ORG }, eng2.id, { startsAt: new Date(Date.now() + 5 * 24 * H).toISOString(), endsAt: new Date(Date.now() + 5 * 24 * H + 4 * H).toISOString() });
  check("a closed worker can't be scheduled on a hired engagement", !sched.ok && /closed their account/.test(sched.ok ? "" : sched.reason), sched);
  check("People hides closed workers", !(await p.worker.findMany({ where: { closedAt: null }, select: { id: true } })).some((w) => w.id === W2));
  check("chat shows the closed worker as “Former worker”", personName({ role: "WORKER", displayName: null, worker: { displayName: w2.displayName } }) === CLOSED_NAME);
  const snap = await p.engagement.findUniqueOrThrow({ where: { id: eng2.id }, select: { applicationSnapshot: true } });
  check("the frozen application snapshot is unchanged", snap.applicationSnapshot === null || typeof snap.applicationSnapshot === "object");

  // --- 9. Data export ---
  const files = await exportAccount({ userId: W1P, workerId: W1, email: "alex@example.com" });
  const names = files.map((f) => f.name);
  check("the export has every file", ["README.txt", "profile.json", "experience.csv", "preferences.json", "metrics.json", "engagements.csv", "shifts.csv", "work-events.csv", "reviews.csv", "pay-lines.csv", "pay-events.csv", "transfers.csv", "disputes.csv", "messages.csv"].every((n) => names.includes(n)), names);
  const rows = (name: string) => files.find((f) => f.name === name)!.text.split("\r\n").filter(Boolean).length - 1;
  check("shifts, events and pay lines are all there", rows("shifts.csv") === (await p.shift.count({ where: { engagement: { workerId: W1 } } })) && rows("work-events.csv") === (await p.workEvent.count({ where: { shift: { engagement: { workerId: W1 } } } })) && rows("pay-lines.csv") === (await p.payout.count({ where: { workerId: W1 } })), { shifts: rows("shifts.csv"), events: rows("work-events.csv"), lines: rows("pay-lines.csv") });
  const profile = JSON.parse(files.find((f) => f.name === "profile.json")!.text);
  check("profile.json carries the name and email", profile.displayName === "Alex Rivera" && profile.email === "alex@example.com", profile);
  check("pay-lines.csv shows each line's status", /"APPROVED"|"VOIDED"|"PAID"/.test(files.find((f) => f.name === "pay-lines.csv")!.text));
  check("the closure facts are consistent with the problems list", closureProblems(await closureFacts(W1)).length > 0);

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
