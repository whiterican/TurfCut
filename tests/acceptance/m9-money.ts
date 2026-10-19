/* M9 acceptance checks: dispute threads and the clock, pay notices (slice 1); receipts and statements follow (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { supervisorShiftAction } from "@/lib/field-day-data";
import * as pay from "@/lib/pay-data";
import { disputeCounts, loadDisputeThread, noteOverdueDisputes, postDisputeMessage } from "@/lib/dispute-thread-data";
import { loadNotifications, unreadNotifications } from "@/lib/notifications-data";
import { payNoticeText } from "@/lib/notification-text";
import { loadReceipt, loadReceipts } from "@/lib/receipts-data";
import { exportAccount } from "@/lib/account-data";
import { ProviderError, type PayoutProvider } from "@/lib/payout-provider";

/** A fake Stripe (as in the M5 checks): records transfers by idempotency key. */
function fakeStripe() {
  const accounts = new Map<string, { enabled: boolean }>();
  const byWorker = new Map<string, string>();
  const transfers = new Map<string, { id: string; amountCents: number; destination: string }>();
  const provider: PayoutProvider = {
    configured: () => true,
    async createAccount({ workerId }) {
      if (!byWorker.has(workerId)) { const id = `acct_${workerId.slice(-4)}`; byWorker.set(workerId, id); accounts.set(id, { enabled: true }); }
      return byWorker.get(workerId)!;
    },
    async onboardingLink(a) { return `https://connect.stripe.test/setup/${a}`; },
    async dashboardLink(a) { return `https://connect.stripe.test/express/${a}`; },
    async payoutsEnabled(a) { return accounts.get(a)?.enabled ?? false; },
    async findTransfer(group) { const t = transfers.get(group); return t ? { id: t.id } : null; },
    async transfer({ amountCents, destination, key }) {
      if (!transfers.has(key)) transfers.set(key, { id: `tr_${transfers.size + 1}`, amountCents, destination });
      return { id: transfers.get(key)!.id };
    },
    parseWebhook() { throw new ProviderError("not used", true); },
  };
  return { provider, transfers };
}

const ORG = "00000000-0000-0000-0000-000000000001";
const ORG2 = "00000000-0000-0000-0000-000000000002";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const SUP = "00000000-0000-0000-0000-0000000000bb";
const FIN = "00000000-0000-0000-0000-0000000000dd";
const OTHER = "00000000-0000-0000-0000-0000000000cc";
const W1 = "00000000-0000-0000-0000-000000000101";
const ENG_W1_A = "00000000-0000-0000-0000-000000000031";
const H = 3_600_000;
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };

(async () => {
  const p = db();
  await p.organization.create({ data: { id: ORG2, name: "Other Campaign Co", approved: true, updatedAt: new Date() } });
  await p.profile.createMany({
    data: [
      { id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" },
      { id: SUP, role: "SUPERVISOR", orgId: ORG, displayName: "Luis Ortega" },
      { id: FIN, role: "FINANCE", orgId: ORG, displayName: "Fran Lee" },
      { id: OTHER, role: "OWNER", orgId: ORG2, displayName: "Other Boss" },
    ],
  });
  // A finished shift, reviewed, so it has a pay line to dispute.
  const start = new Date(Date.now() - 2 * 24 * H);
  const shift = await p.shift.create({ data: { engagementId: ENG_W1_A, startsAt: start, endsAt: new Date(start.getTime() + 4 * H), status: "COMPLETED", checkInAt: start, checkOutAt: new Date(start.getTime() + 4 * H) } });
  await p.workEvent.createMany({ data: [{ type: "CHECK_IN", at: 0 }, { type: "SIGNATURE_SUBMITTED", at: 2 * H, payload: { count: 30 } }, { type: "CHECK_OUT", at: 4 * H }].map((e) => ({ shiftId: shift.id, type: e.type as never, payload: (e as { payload?: object }).payload ?? {}, createdAt: new Date(start.getTime() + e.at) })) });
  const approved = await supervisorShiftAction({ profileId: SUP, orgId: ORG }, shift.id, { kind: "closeout", status: "APPROVED", reason: null }, new Date());
  check("the shift is approved and has a pay line", approved.ok && (await p.payout.count({ where: { shiftId: shift.id } })) === 1, approved);

  const worker = { profileId: W1, role: "WORKER" as const, orgId: null, workerId: W1 };
  const fin = { profileId: FIN, role: "FINANCE" as const, orgId: ORG, workerId: null };
  const sup = { profileId: SUP, role: "SUPERVISOR" as const, orgId: ORG, workerId: null };
  const other = { profileId: OTHER, role: "OWNER" as const, orgId: ORG2, workerId: null };
  const finPay = { profileId: FIN, orgId: ORG, role: "FINANCE" as const };
  const t0 = new Date("2026-10-22T15:30:00Z"); // a Thursday
  const notices = (kind: string, recipientId?: string) => p.notification.count({ where: { kind: kind as never, ...(recipientId ? { recipientId } : {}) } });

  // --- Opening tells the pay roles, not the supervisor ---
  const opened = await pay.openDispute({ workerId: W1, profileId: W1 }, shift.id, "I checked out at 5:30, not 4:30, so an hour is missing.", t0);
  const d = await p.payDispute.findFirstOrThrow({ where: { shiftId: shift.id } });
  check("opening a dispute tells the owner and finance, not the supervisor", opened.ok && (await notices("DISPUTE_OPENED", OWNER)) === 1 && (await notices("DISPUTE_OPENED", FIN)) === 1 && (await notices("DISPUTE_OPENED", SUP)) === 0, opened);
  const subject = await p.notification.findFirst({ where: { kind: "DISPUTE_OPENED" } });
  check("the notice is about the dispute and nothing else", subject?.disputeId === d.id && subject.engagementId === null && subject.postId === null && subject.transferId === null, subject);

  // --- Who sees the thread ---
  const asWorker = await loadDisputeThread(worker, d.id, t0);
  const asFin = await loadDisputeThread(fin, d.id, t0);
  check("the worker and finance see the thread; the worker writes, finance writes and resolves", !!asWorker && asWorker.viewer === "worker" && asWorker.canWrite && !asWorker.canResolve && !!asFin && asFin.canWrite && asFin.canResolve, { asWorker, asFin });
  check("another organization and an unrelated supervisor see nothing", (await loadDisputeThread(other, d.id, t0)) === null && (await loadDisputeThread(sup, d.id, t0)) === null);
  await p.shift.update({ where: { id: shift.id }, data: { supervisorId: SUP } });
  const asSup = await loadDisputeThread(sup, d.id, t0);
  check("the shift's supervisor reads the thread but can't write or resolve", !!asSup && !asSup.canWrite && !asSup.canResolve, asSup);
  check("the clock: reply by Tue Oct 27, resolve by Thu Nov 5, nothing overdue yet", asFin!.clock.firstResponseDue.toISOString() === "2026-10-27T15:30:00.000Z" && asFin!.clock.resolutionDue.toISOString() === "2026-11-05T15:30:00.000Z" && asFin!.clock.overdue === null, asFin!.clock);

  // --- Writing ---
  check("a supervisor can't write; another org can't write", !(await postDisputeMessage(sup, d.id, "I was there.", t0)).ok && !(await postDisputeMessage(other, d.id, "Hi", t0)).ok);
  check("an empty or oversize message is refused", !(await postDisputeMessage(worker, d.id, "   ", t0)).ok && !(await postDisputeMessage(worker, d.id, "x".repeat(2001), t0)).ok);
  const m1 = await postDisputeMessage(worker, d.id, "Here's a photo timestamp from 5:28 if that helps.", new Date(t0.getTime() + H));
  check("the worker writes and the pay roles are told (once each, not the worker)", m1.ok && (await notices("DISPUTE_MESSAGE", OWNER)) === 1 && (await notices("DISPUTE_MESSAGE", FIN)) === 1 && (await notices("DISPUTE_MESSAGE", W1)) === 0, m1);
  const stillWaiting = await loadDisputeThread(fin, d.id, new Date(t0.getTime() + 2 * H));
  check("a worker's own message doesn't count as the organization's reply", stillWaiting!.clock.firstResponseMetAt === null && stillWaiting!.messages.length === 1 && stillWaiting!.messages[0].side === "worker");

  // --- Overdue: the first reply deadline passes ---
  const late = new Date("2026-10-27T16:00:00Z");
  const before = await disputeCounts(ORG, new Date("2026-10-27T10:00:00Z"));
  const counts = await disputeCounts(ORG, late);
  check("the Desk counts it due today, then overdue", before.dueToday === 1 && before.overdue === 0 && counts.overdue === 1 && counts.open === 1, { before, counts });
  const sent = await noteOverdueDisputes(ORG, late);
  const again = await noteOverdueDisputes(ORG, late);
  check("the pay roles are told once that it's overdue, and only once", sent === 1 && again === 0 && (await notices("DISPUTE_OVERDUE", OWNER)) === 1 && (await notices("DISPUTE_OVERDUE", FIN)) === 1 && (await notices("DISPUTE_OVERDUE", SUP)) === 0, { sent, again });
  const orgView = await pay.loadOrgDisputes(finPay, true, late);
  check("the Pay tab shows the dispute overdue with its message count", orgView[0]?.clock.overdue === "first" && orgView[0].messages === 1, orgView[0]?.clock);
  const workerEarn = await pay.loadWorkerEarnings(W1);
  const row = workerEarn.campaigns.flatMap((c) => c.shifts).find((x) => x.shiftId === shift.id);
  check("the worker's Earnings carry the clock and the message count", row?.disputes[0]?.messages === 1 && !!row.disputes[0].clock.firstResponseDue, row?.disputes);

  // --- Finance replies: the first deadline is met late; the worker is told ---
  const reply = new Date("2026-10-28T09:00:00Z");
  const m2 = await postDisputeMessage(fin, d.id, "Checked the check-out event: it was corrected to 5:30 by Luis. Adjusting now.", reply);
  const afterReply = await loadDisputeThread(worker, d.id, new Date(reply.getTime() + H));
  check("finance's reply tells the worker and meets the first deadline (late); the resolution clock still runs", m2.ok && (await notices("DISPUTE_MESSAGE", W1)) === 1 && afterReply!.clock.firstResponseMetAt?.getTime() === reply.getTime() && afterReply!.clock.overdue === null && afterReply!.clock.next?.kind === "resolution" && afterReply!.clock.daysToFirstResponse === 4, afterReply!.clock);
  check("the worker sees finance's message named by role", afterReply!.messages[1]?.side === "org" && /Finance/.test(afterReply!.messages[1].author) && !afterReply!.messages[1].mine, afterReply!.messages);

  // --- Resolution tells the worker and closes the thread ---
  const res = await pay.resolveDispute(finPay, d.id, { outcome: "ADJUSTED", response: "One hour added at $25.", amountCents: 2500 }, new Date("2026-10-29T12:00:00Z"));
  const closed = await loadDisputeThread(worker, d.id, new Date("2026-12-01T00:00:00Z"));
  check("resolving tells the worker; the closed thread stays readable, never overdue, and takes no more messages", res.ok && (await notices("DISPUTE_RESOLVED", W1)) === 1 && !!closed && !closed.canWrite && closed.clock.overdue === null && closed.clock.daysToResolution === 5 && !(await postDisputeMessage(worker, d.id, "One more thing", new Date())).ok, { res, closed });
  check("an overdue notice is never repeated after resolution", (await noteOverdueDisputes(ORG, new Date("2026-12-01T00:00:00Z"))) === 0 && (await notices("DISPUTE_OVERDUE")) === 2);

  // --- Notices reach the right bells, with words ---
  const finNotices = await loadNotifications({ userId: FIN, role: "FINANCE", workerId: null, orgId: ORG });
  const supNotices = await loadNotifications({ userId: SUP, role: "SUPERVISOR", workerId: null, orgId: ORG });
  const w1Notices = await loadNotifications({ userId: W1, role: "WORKER", workerId: W1, orgId: null });
  check("finance (not a hiring role) sees its dispute notices; the supervisor has none; the worker has the reply and the outcome", finNotices.filter((n) => n.dispute).length === 3 && supNotices.length === 0 && w1Notices.filter((n) => n.dispute).length === 2, { fin: finNotices.length, sup: supNotices.length, w1: w1Notices.length });
  const t = payNoticeText("DISPUTE_RESOLVED", w1Notices.find((n) => n.kind === "DISPUTE_RESOLVED")!, "worker");
  check("the words name the organization and the job, and lead to the thread", !!t && /Front Range Circulators closed your pay dispute for/.test(t.text) && t.href === `/earnings/disputes/${d.id}`, t);
  check("the bell counts them", (await unreadNotifications({ userId: W1, role: "WORKER", workerId: W1, orgId: null })) === 2 && (await unreadNotifications({ userId: FIN, role: "FINANCE", workerId: null, orgId: ORG })) === 3);

  // --- Append-only ---
  let blocked = false;
  try { await p.payDisputeMessage.updateMany({ where: { disputeId: d.id }, data: { body: "edited" } }); } catch { blocked = true; }
  check("dispute messages can't be edited", blocked);
  let noSubject = false;
  try { await p.notification.create({ data: { recipientId: W1, kind: "DISPUTE_OPENED", engagementId: ENG_W1_A } }); } catch { noSubject = true; }
  check("a dispute notice must be about a dispute (the database checks)", noSubject);

  // ============ Slice 2: receipts ============
  const stripe = fakeStripe();
  const W2 = "00000000-0000-0000-0000-000000000102";
  const ownPay = { profileId: OWNER, orgId: ORG, role: "OWNER" as const };
  await pay.ensurePayoutAccount(W1, stripe.provider);
  await pay.ensurePayoutAccount(W2, stripe.provider);
  // The shift line and the dispute's adjustment, approved by the owner (finance made the adjustment). The seed's
  // already-approved line for this worker rides along in the same payment.
  const linesW1 = await p.payout.findMany({ where: { shiftId: shift.id }, select: { id: true } });
  const approveW1 = await pay.lineAction(ownPay, linesW1.map((l) => l.id), "approve", null, new Date());
  const run1 = await pay.payWorker(ownPay, W1, stripe.provider, null, new Date("2026-11-02T18:00:00Z"));
  const t1 = run1.ok ? await p.payoutTransfer.findUniqueOrThrow({ where: { id: run1.transferId } }) : null;
  check("paying a worker records a transfer with receipt number 1 for the organization", approveW1.ok && run1.ok && run1.outcome === "paid" && t1?.receiptNo === 1, { approveW1, run1, t1 });
  check("the worker is told the money was sent, once, about the transfer", (await notices("PAYOUT_SENT", W1)) === 1 && (await p.notification.findFirst({ where: { kind: "PAYOUT_SENT" } }))?.transferId === t1?.id);
  const r1 = await loadReceipt(W1, t1!.id);
  check("the receipt: R-000001, sent, the Stripe reference, the account's last four, every line, the total", !!r1 && r1.number === "R-000001" && r1.status === "sent" && r1.providerRef === "tr_1" && r1.destinationTail === "0101" && r1.lines.length === 3 && r1.lines.reduce((n, l) => n + l.amountCents, 0) === r1.amountCents && r1.amountCents === t1!.amountCents, r1);
  check("the adjustment line names its dispute; the shift line its formula", r1!.lines.some((l) => l.kind === "ADJUSTMENT" && l.disputeId === d.id) && r1!.lines.some((l) => l.kind === "SHIFT" && /4h verified/.test(l.formula)), r1!.lines);
  check("another worker can't open it, and it isn't in their list", (await loadReceipt(W2, t1!.id)) === null && (await loadReceipts(W2)).length === 0);
  // A second worker paid by the same organization gets receipt 2; another organization starts at 1.
  const s2 = await p.shift.create({ data: { engagementId: (await p.engagement.create({ data: { jobId: (await p.job.findFirstOrThrow({ where: { orgId: ORG } })).id, workerId: W2, status: "ACTIVE", hiredById: OWNER } })).id, startsAt: start, endsAt: new Date(start.getTime() + 4 * H), status: "COMPLETED", checkInAt: start, checkOutAt: new Date(start.getTime() + 4 * H) } });
  await p.workEvent.createMany({ data: [{ type: "CHECK_IN", at: 0 }, { type: "CHECK_OUT", at: 4 * H }].map((e) => ({ shiftId: s2.id, type: e.type as never, payload: {}, createdAt: new Date(start.getTime() + e.at) })) });
  await supervisorShiftAction({ profileId: SUP, orgId: ORG }, s2.id, { kind: "closeout", status: "APPROVED", reason: null }, new Date());
  const l2 = await p.payout.findFirstOrThrow({ where: { shiftId: s2.id } });
  await pay.lineAction(ownPay, [l2.id], "approve", null, new Date());
  const run2 = await pay.payWorker(ownPay, W2, stripe.provider, null, new Date("2026-11-02T19:00:00Z"));
  const t2 = run2.ok ? await p.payoutTransfer.findUniqueOrThrow({ where: { id: run2.transferId } }) : null;
  check("the organization's next receipt is R-000002", run2.ok && t2?.receiptNo === 2, { run2, t2 });
  let dup = false;
  try { await p.payoutTransfer.create({ data: { workerId: W2, orgId: ORG, amountCents: 1, feeCents: 0, receiptNo: 2, destination: "x", createdById: OWNER } }); } catch { dup = true; }
  check("two receipts can't share a number in one organization (the database refuses)", dup);
  // A full reversal: the worker is told, the receipt says so and stays.
  const full = { id: "evt_rev_1", type: "transfer.reversed", transfer: { id: "tr_1", group: t1!.id, amountCents: t1!.amountCents, reversedCents: t1!.amountCents } };
  const applied = await pay.handleProviderEvent(full, new Date("2026-11-04T10:00:00Z"));
  const r1b = await loadReceipt(W1, t1!.id);
  check("a reversal tells the worker once and the receipt records it, keeping its number and lines", applied === "applied" && (await notices("PAYOUT_REVERSED", W1)) === 1 && r1b?.status === "reversed" && !!r1b.reversedAt && r1b.number === "R-000001" && r1b.lines.length === 3, r1b);
  check("the same reversal again changes nothing", (await pay.handleProviderEvent(full, new Date())) === "duplicate" && (await notices("PAYOUT_REVERSED", W1)) === 1);
  const list = await loadReceipts(W1);
  check("the worker's list has the one receipt, newest first", list.length === 1 && list[0].id === t1!.id);
  const pt = payNoticeText("PAYOUT_SENT", { dispute: null, transfer: { id: t1!.id, amountCents: 12500, worker: { displayName: "Alex Rivera" }, org: { name: "Front Range Circulators" } } }, "worker");
  check("the notice says the amount and leads to the receipt", !!pt && /\$125\.00 from Front Range Circulators was sent/.test(pt.text) && pt.href === `/earnings/receipts/${t1!.id}`, pt);
  const files = await exportAccount({ userId: W1, workerId: W1 });
  const transfersCsv = files.find((f) => f.name === "transfers.csv")?.text ?? "";
  check("the data export carries the receipt number", /receipt/.test(transfersCsv.split("\n")[0]) && /R-000001/.test(transfersCsv), transfersCsv.split("\n").slice(0, 2));

  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
