/* M5 acceptance checks: pay lines, disputes, Stripe transfers, against a fresh database (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { supervisorShiftAction } from "@/lib/field-day-data";
import * as pay from "@/lib/pay-data";
import { lineState } from "@/lib/pay";
import { ProviderError, type PayoutProvider } from "@/lib/payout-provider";

/** A fake Stripe: records transfers by idempotency key; can refuse or time out. */
function fakeStripe() {
  const accounts = new Map<string, { enabled: boolean }>();
  const byWorker = new Map<string, string>();
  const transfers = new Map<string, { id: string; amountCents: number; destination: string }>();
  let creates = 0;
  let next: "ok" | "refuse" | "timeout-after-send" | "timeout-before-send" = "ok";
  let lookupFails = false;
  const provider: PayoutProvider = {
    configured: () => true,
    async createAccount({ workerId }) {
      if (!byWorker.has(workerId)) {
        creates++;
        const id = `acct_${workerId.slice(-3)}`;
        byWorker.set(workerId, id);
        accounts.set(id, { enabled: false });
      }
      return byWorker.get(workerId)!;
    },
    async onboardingLink(a) { return `https://connect.stripe.test/setup/${a}`; },
    async dashboardLink(a) { return `https://connect.stripe.test/express/${a}`; },
    async payoutsEnabled(a) { return accounts.get(a)?.enabled ?? false; },
    async findTransfer(group) {
      if (lookupFails) throw new ProviderError("Stripe refused the request: permission", true);
      const t = transfers.get(group);
      return t ? { id: t.id } : null;
    },
    async transfer({ amountCents, destination, key }) {
      const mode = next;
      next = "ok";
      if (mode === "refuse") throw new ProviderError("Stripe refused the request: balance_insufficient", true);
      if (mode === "timeout-before-send") throw new ProviderError("Couldn't reach Stripe.", false);
      if (!transfers.has(key)) transfers.set(key, { id: `tr_${transfers.size + 1}`, amountCents, destination });
      if (mode === "timeout-after-send") throw new ProviderError("Couldn't reach Stripe.", false);
      return { id: transfers.get(key)!.id };
    },
    parseWebhook() { throw new Error("not used"); },
  };
  return { provider, accounts, transfers, creates: () => creates, failNext: (m: typeof next) => (next = m), failLookup: (v: boolean) => (lookupFails = v) };
}

const ORG = "00000000-0000-0000-0000-000000000001";
const ORG2 = "00000000-0000-0000-0000-000000000002";
const JOB_A = "00000000-0000-0000-0000-000000000011";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const SUP = "00000000-0000-0000-0000-0000000000bb";
const FIN = "00000000-0000-0000-0000-0000000000dd";
const OTHER = "00000000-0000-0000-0000-0000000000cc";
const [W1, W2] = ["101", "102"].map((n) => `00000000-0000-0000-0000-000000000${n}`);
const ENG_W1_A = "00000000-0000-0000-0000-000000000031";
const H = 3_600_000;

let fails = 0;
export function check(label: string, cond: unknown, detail?: unknown) {
  if (cond) console.log(`PASS ${label}`);
  else {
    fails++;
    console.log(`FAIL ${label}`, detail ?? "");
  }
}

const supA = { profileId: SUP, orgId: ORG };
const otherA = { profileId: OTHER, orgId: ORG2 };

/** A finished shift: 4h on shift with a 30 min break → 3.5 verified hours. */
async function workedShift(engagementId: string, daysAgo: number, extra: Array<{ type: string; payload: object; at: number }> = []) {
  const p = db();
  const start = new Date(Date.now() - daysAgo * 24 * H);
  const s = await p.shift.create({ data: { engagementId, startsAt: start, endsAt: new Date(start.getTime() + 4 * H), status: "COMPLETED", checkInAt: start, checkOutAt: new Date(start.getTime() + 4 * H) } });
  const ev = [
    { type: "CHECK_IN", payload: {}, at: 0 },
    { type: "PAUSE_START", payload: {}, at: 1 * H },
    { type: "PAUSE_END", payload: {}, at: 1.5 * H },
    { type: "SIGNATURE_SUBMITTED", payload: { count: 30 }, at: 2 * H },
    { type: "CHECK_OUT", payload: {}, at: 4 * H },
    ...extra,
  ];
  await p.workEvent.createMany({ data: ev.map((e) => ({ shiftId: s.id, type: e.type as never, payload: e.payload, createdAt: new Date(start.getTime() + e.at) })) });
  return s.id;
}

async function setup() {
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
}

async function slice2() {
  const p = db();
  const now = () => new Date();
  // --- Supervisor approval creates the pay line ---
  const s1 = await workedShift(ENG_W1_A, 2);
  check("another org can't review the shift", !(await supervisorShiftAction(otherA, s1, { kind: "closeout", status: "APPROVED", reason: null })).ok);
  const r1 = await supervisorShiftAction(supA, s1, { kind: "closeout", status: "APPROVED", reason: null }, now());
  check("supervisor approves the shift", r1.ok, r1);
  let lines = await p.payout.findMany({ where: { shiftId: s1 }, include: { events: true } });
  check("approval creates one SHIFT line", lines.length === 1 && lines[0].kind === "SHIFT", lines);
  const l1 = lines[0];
  check("hourly pay: 3.5 verified h × $25 = $87.50, fee $13.13", l1.amountCents === 8750 && l1.feeCents === 1313, l1);
  const v1 = await p.validation.findFirst({ where: { shiftId: s1, workEventId: null }, orderBy: { createdAt: "desc" } });
  check("line traces to job org, worker, shift and the approval (reviewer)", l1.orgId === ORG && l1.workerId === W1 && l1.engagementId === ENG_W1_A && l1.validationId === v1?.id && v1?.reviewerId === SUP && l1.createdById === SUP);
  check("basis is frozen with the formula", (l1.basis as { formula?: string }).formula === "3h 30m verified × $25.00/hr");
  check("audit records the line", !!(await p.auditEvent.findFirst({ where: { action: "payout.created", entityId: l1.id } })));

  // --- Re-approving with the same pay keeps the line (double-click safe) ---
  await supervisorShiftAction(supA, s1, { kind: "closeout", status: "APPROVED", reason: null }, now());
  lines = await p.payout.findMany({ where: { shiftId: s1 }, include: { events: true } });
  check("a repeated approval doesn't add a line", lines.length === 1 && lines[0].events.length === 0, lines);

  // --- Re-review before payment approval voids and replaces ---
  const rej = await supervisorShiftAction(supA, s1, { kind: "closeout", status: "REJECTED", reason: "Wrong turf" }, now());
  check("re-review to not approved works before pay approval", rej.ok, rej);
  lines = await p.payout.findMany({ where: { shiftId: s1 }, include: { events: true } });
  check("rejecting voids the line", lines.length === 1 && lineState(lines[0], lines[0].events, false).status === "VOIDED");
  await supervisorShiftAction(supA, s1, { kind: "closeout", status: "APPROVED", reason: null }, now());
  lines = await p.payout.findMany({ where: { shiftId: s1, kind: "SHIFT" }, include: { events: true }, orderBy: { createdAt: "asc" } });
  check("re-approving creates a fresh line", lines.length === 2 && lineState(lines[1], lines[1].events, false).status === "AWAITING_APPROVAL");

  // --- Per accepted signature needs the batch count ---
  const job = await p.job.findUniqueOrThrow({ where: { id: JOB_A } });
  const perUnit = await p.job.create({
    data: { orgId: ORG, jurisdictionId: job.jurisdictionId, type: "PETITION", title: "Per-signature drive", status: "PUBLISHED", compensationMethod: "PER_UNIT", payRateCents: 150 },
  });
  const e2 = await p.engagement.create({ data: { jobId: perUnit.id, workerId: W2, status: "ACTIVE", hiredById: OWNER } });
  const s2 = await workedShift(e2.id, 3);
  const noCount = await supervisorShiftAction(supA, s2, { kind: "closeout", status: "APPROVED", reason: null }, now());
  check("per-signature shift can't be approved before the batch count", !noCount.ok && /batch/i.test(noCount.ok ? "" : noCount.reason), noCount);
  check("…and nothing was written", (await p.validation.count({ where: { shiftId: s2, workEventId: null } })) === 0 && (await p.payout.count({ where: { shiftId: s2 } })) === 0);
  await supervisorShiftAction(supA, s2, { kind: "batch_count", reviewed: 30, accepted: 25, rejected: 5, exceptions: null }, now());
  await supervisorShiftAction(supA, s2, { kind: "batch_count", reviewed: 30, accepted: 20, rejected: 10, exceptions: "recount" }, now());
  const okCount = await supervisorShiftAction(supA, s2, { kind: "closeout", status: "APPROVED", reason: null }, now());
  const l2 = await p.payout.findFirst({ where: { shiftId: s2 } });
  check("per-signature pay uses the latest count: 20 × $1.50 = $30", okCount.ok && l2?.amountCents === 3000, { okCount, l2 });

  // --- Disputes (worker side) ---
  const w2 = { workerId: W2, profileId: W2 };
  const w1 = { workerId: W1, profileId: W1 };
  check("a worker can't dispute someone else's shift", !(await pay.openDispute(w1, s2, "This isn't right at all.")).ok);
  check("a dispute needs a real reason", !(await pay.openDispute(w2, s2, "bad")).ok);
  const d1 = await pay.openDispute(w2, s2, "I think 25 signatures were accepted, not 20.");
  check("worker disputes their shift's pay", d1.ok, d1);
  check("only one open dispute per shift", !(await pay.openDispute(w2, s2, "Another complaint about the count.")).ok);
  const disp = await p.payDispute.findFirstOrThrow({ where: { shiftId: s2 } });
  check("dispute is routed to the job's org and names the line", disp.orgId === ORG && disp.payoutId === l2?.id);
  const earn = await pay.loadWorkerEarnings(W2);
  const row = earn.campaigns.flatMap((c) => c.shifts).find((x) => x.shiftId === s2);
  check("earnings show the line as disputed", row?.lines[0]?.state.status === "DISPUTED" && row.canDispute === false, row);
  const e1 = await pay.loadWorkerEarnings(W1);
  check("worker earnings only include their own pay", e1.campaigns.every((c) => c.shifts.every((x) => x.shiftId !== s2)));
  check("a rejected-then-approved shift totals once", e1.campaigns.flatMap((c) => c.shifts).find((x) => x.shiftId === s1)?.totalCents === 8750);
  return { s1, s2, perUnitId: perUnit.id, e2: e2.id };
}

async function slice3(ctx: { s1: string; s2: string; perUnitId: string; e2: string }) {
  const p = db();
  const now = () => new Date();
  const fin = { profileId: FIN, orgId: ORG, role: "FINANCE" as const };
  const own = { profileId: OWNER, orgId: ORG, role: "OWNER" as const };
  const supPay = { profileId: SUP, orgId: ORG, role: "SUPERVISOR" as const };
  const other = { profileId: OTHER, orgId: ORG2, role: "OWNER" as const };
  const active = async (shiftId: string) => {
    const ls = await p.payout.findMany({ where: { shiftId, kind: "SHIFT" }, include: { events: true }, orderBy: { createdAt: "asc" } });
    return ls.map((l) => ({ l, st: lineState(l, l.events, false) })).filter((x) => x.st.status !== "VOIDED");
  };
  const [a1] = await active(ctx.s1);

  // --- Roles and orgs ---
  check("a supervisor can't approve pay", !(await pay.lineAction(supPay, [a1.l.id], "approve")).ok);
  check("another org can't approve the line", !(await pay.lineAction(other, [a1.l.id], "approve")).ok);
  check("hold needs a reason", !(await pay.lineAction(fin, [a1.l.id], "hold", " ")).ok);
  const ap = await pay.lineAction(fin, [a1.l.id], "approve", null, now());
  check("finance approves the line", ap.ok, ap);
  check("approving twice is refused", !(await pay.lineAction(fin, [a1.l.id], "approve")).ok);
  check("approval is audited", !!(await p.auditEvent.findFirst({ where: { action: "payout.approved", entityId: a1.l.id } })));

  // --- Review is final once pay is approved ---
  const late = await supervisorShiftAction(supA, ctx.s1, { kind: "closeout", status: "REJECTED", reason: "changed my mind" }, now());
  check("re-review after pay approval is refused", !late.ok && /final/.test(late.ok ? "" : late.reason), late);

  // --- Ready to pay: blocked until the worker sets up payouts ---
  let org = await pay.loadOrgPay(fin);
  const w1Pay = org.toPay.find((w) => w.workerId === W1);
  check("approved pay is ready to pay for the worker", !!w1Pay && w1Pay.amountCents >= 8750, org.toPay);
  check("…blocked without a Stripe payout account", !!w1Pay?.blocked && /Stripe/.test(w1Pay.blocked));

  // --- A hold carries over when a supervisor replaces the line ---
  const e2 = ctx.e2;
  const s4 = await workedShift(e2, 4);
  await supervisorShiftAction(supA, s4, { kind: "batch_count", reviewed: 30, accepted: 25, rejected: 5, exceptions: null }, now());
  await supervisorShiftAction(supA, s4, { kind: "closeout", status: "APPROVED", reason: null }, now());
  const [h1] = await active(s4);
  check("finance holds a line with a reason", (await pay.lineAction(fin, [h1.l.id], "hold", "Check the packet count", now())).ok);
  const rc = await supervisorShiftAction(supA, s4, { kind: "batch_count", reviewed: 30, accepted: 20, rejected: 10, exceptions: "recount" }, now());
  check("recount allowed while pay isn't approved", rc.ok, rc);
  await supervisorShiftAction(supA, s4, { kind: "closeout", status: "APPROVED", reason: null }, now());
  const after = await active(s4);
  check("re-approval replaces the line at the new count", after.length === 1 && after[0].l.amountCents === 3000, after.map((x) => x.l.amountCents));
  check("…and the hold carries over", after[0].st.status === "HELD" && after[0].st.heldReason === "Check the packet count", after[0].st);
  check("void is audited", !!(await p.auditEvent.findFirst({ where: { action: "payout.voided", entityId: h1.l.id } })));
  check("release lifts the hold", (await pay.lineAction(own, [after[0].l.id], "release", null, now())).ok);
  check("owner approves it", (await pay.lineAction(own, [after[0].l.id], "approve", null, now())).ok);
  const rc2 = await supervisorShiftAction(supA, s4, { kind: "batch_count", reviewed: 30, accepted: 30, rejected: 0, exceptions: null }, now());
  check("a recount after pay approval is refused", !rc2.ok, rc2);

  // --- Disputes: resolve ---
  const d = await p.payDispute.findFirstOrThrow({ where: { shiftId: ctx.s2 } });
  check("a supervisor can't close a pay dispute", !(await pay.resolveDispute(supPay, d.id, { outcome: "KEPT", response: "fine" })).ok);
  check("another org can't close it", !(await pay.resolveDispute(other, d.id, { outcome: "KEPT", response: "fine" })).ok);
  check("re-reviewed needs a review after the dispute", !(await pay.resolveDispute(fin, d.id, { outcome: "REREVIEWED", response: "Looked again." })).ok);
  check("a deduction can't exceed the shift's pay", !(await pay.resolveDispute(fin, d.id, { outcome: "ADJUSTED", response: "Too much.", amountCents: -3001 })).ok);
  const res = await pay.resolveDispute(fin, d.id, { outcome: "ADJUSTED", response: "Five more signatures were valid.", amountCents: 750 }, now());
  check("finance adjusts the pay", res.ok, res);
  const adj = await p.payout.findFirst({ where: { shiftId: ctx.s2, kind: "ADJUSTMENT" }, include: { events: true } });
  check("adjustment line: +$7.50, fee $1.13, corrects the current line, awaits approval like its shift", adj?.amountCents === 750 && adj.feeCents === 113 && adj.adjustsId === d.payoutId && lineState(adj, adj.events, false).status === "AWAITING_APPROVAL", adj);
  check("dispute can't be closed twice", !(await pay.resolveDispute(fin, d.id, { outcome: "KEPT", response: "again" })).ok);
  const w2earn = await pay.loadWorkerEarnings(W2);
  const row = w2earn.campaigns.flatMap((c) => c.shifts).find((x) => x.shiftId === ctx.s2);
  check("worker sees the adjustment and the response", row?.totalCents === 3750 && row.lines.some((l) => l.kind === "ADJUSTMENT" && l.reason === "Five more signatures were valid.") && row.disputes[0].resolution?.outcome === "ADJUSTED", row);
  const base2 = (await active(ctx.s2))[0];
  check("whoever made an adjustment can't approve it", !(await pay.lineAction(fin, [adj!.id], "approve", null, now())).ok);
  check("the owner approves the shift line and the adjustment together", (await pay.lineAction(own, [base2.l.id, adj!.id], "approve", null, now())).ok);
  check("after approval the review is final", !(await supervisorShiftAction(supA, ctx.s2, { kind: "closeout", status: "REJECTED", reason: "x" }, now())).ok);
  check("export / Pay page refuse a non-pay role", await pay.loadOrgPay(supPay).then(() => false, () => true));

  // --- Export ---
  const csv = await pay.exportLedger(fin, new Date(Date.now() - 30 * 86_400_000), new Date(Date.now() + 86_400_000));
  const rows = csv.trim().split("\r\n");
  check("export has a header and a row per line", csv.startsWith("\uFEFF") && rows[0].startsWith("line_id,kind,status,payee") && rows.length - 1 === (await p.payout.count({ where: { orgId: ORG, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } })), rows.length);
  check("export traces payee, project, reviewer and approver", rows.some((r) => r.includes('"Alex Rivera"') && r.includes('"Luis Ortega"') && r.includes('"Fran Lee"') && r.includes('"Petition circulation"')));
  check("export never contains another org's lines", !(await pay.exportLedger(other, new Date(0), new Date(Date.now() + 86_400_000))).includes("Alex"));
  check("csv cells can't start a formula", pay.csvCell("=HYPERLINK(1)") === `"'=HYPERLINK(1)"` && pay.csvCell(-12.5) === '"-12.5"');
  org = await pay.loadOrgPay(other);
  check("other org's Pay page is empty", org.toPay.length === 0 && org.awaiting.length === 0);
}

async function slice4() {
  const p = db();
  const now = () => new Date();
  const fin = { profileId: FIN, orgId: ORG, role: "FINANCE" as const };
  const supPay = { profileId: SUP, orgId: ORG, role: "SUPERVISOR" as const };
  const other = { profileId: OTHER, orgId: ORG2, role: "OWNER" as const };
  const fake = fakeStripe();
  const st = fake.provider;
  const lineStates = async (workerId: string) =>
    (await p.payout.findMany({ where: { workerId, orgId: ORG }, include: { events: true } })).map((l) => ({ l, s: lineState(l, l.events, false) }));

  check("no payout account yet → can't pay", !(await pay.payWorker(fin, W1, st)).ok);
  const acct = await pay.ensurePayoutAccount(W1, st);
  const again = await pay.ensurePayoutAccount(W1, st);
  check("one Stripe account per worker", acct === again && fake.creates() === 1 && (await p.worker.findUniqueOrThrow({ where: { id: W1 } })).stripeAccountId === acct);
  const notReady = await pay.payWorker(fin, W1, st);
  check("setup not finished → can't pay (re-checked with Stripe)", !notReady.ok && /finished/.test(notReady.ok ? "" : notReady.reason), notReady);
  fake.accounts.get(acct)!.enabled = true;
  check("a supervisor can't pay", !(await pay.payWorker(supPay, W1, st)).ok);
  check("another org has nothing to pay this worker", !(await pay.payWorker(other, W1, st)).ok);

  const before = (await lineStates(W1)).filter((x) => x.s.payable);
  const expect = before.reduce((n, x) => n + x.l.amountCents, 0);
  const run = await pay.payWorker(fin, W1, st, null, now());
  check("finance pays the worker in one transfer", run.ok && run.outcome === "paid", run);
  const tr = run.ok ? await p.payoutTransfer.findUniqueOrThrow({ where: { id: run.transferId } }) : null;
  check("transfer = sum of approved lines, sent to the worker's account", tr?.amountCents === expect && tr.destination === acct && fake.transfers.get(tr.id)?.amountCents === expect, { tr, expect });
  const afterPay = await lineStates(W1);
  check("every included line is paid with the Stripe reference", before.every((b) => { const x = afterPay.find((a) => a.l.id === b.l.id)!; return x.s.status === "PAID" && x.s.paidRef === fake.transfers.get(tr!.id)!.id; }));
  check("paying again has nothing to send", !(await pay.payWorker(fin, W1, st)).ok);
  check("paid transfer is audited", !!(await p.auditEvent.findFirst({ where: { action: "payout.paid", entityId: tr!.id } })));

  // --- A refusal: nothing moved, the lines can be paid again ---
  const s5 = await workedShift(ENG_W1_A, 5);
  await supervisorShiftAction(supA, s5, { kind: "closeout", status: "APPROVED", reason: null }, now());
  const l5 = await p.payout.findFirstOrThrow({ where: { shiftId: s5 } });
  await pay.lineAction(fin, [l5.id], "approve", null, now());
  fake.failNext("refuse");
  const refused = await pay.payWorker(fin, W1, st, null, now());
  check("a refusal is recorded as failed", refused.ok && refused.outcome === "failed" && /balance/.test(refused.message), refused);
  let x5 = (await lineStates(W1)).find((x) => x.l.id === l5.id)!;
  check("…and the line is payable again with the reason shown", x5.s.status === "APPROVED" && x5.s.payable && /failed/.test(x5.s.note ?? ""), x5.s);

  // --- A timeout after Stripe sent it: never paid twice ---
  fake.failNext("timeout-after-send");
  const unsure = await pay.payWorker(fin, W1, st, null, now());
  check("an unclear answer leaves the line sending", unsure.ok && unsure.outcome === "pending", unsure);
  x5 = (await lineStates(W1)).find((x) => x.l.id === l5.id)!;
  check("…shown as sending, not payable", x5.s.status === "PROCESSING" && !x5.s.payable);
  check("…and a new pay run is refused until it's checked", !(await pay.payWorker(fin, W1, st)).ok);
  const pend = await pay.pendingTransfers(fin);
  check("finance sees it waiting for Stripe", pend.length === 1);
  const sendsBefore = fake.transfers.size;
  const settled = await pay.settleTransfer(fin, pend[0].id, st, now());
  check("checking finds the transfer Stripe already made", settled.ok && settled.outcome === "paid" && fake.transfers.size === sendsBefore, settled);
  check("settling again is a no-op", (await pay.settleTransfer(fin, pend[0].id, st)).ok && fake.transfers.size === sendsBefore);
  check("another org can't settle it", !(await pay.settleTransfer(other, pend[0].id, st)).ok);

  // --- Webhooks ---
  const paidTr = await p.payoutTransfer.findUniqueOrThrow({ where: { id: pend[0].id } });
  const stripeId = fake.transfers.get(paidTr.id)!.id;
  const partial = { id: "evt_partial", type: "transfer.reversed", transfer: { id: stripeId, group: paidTr.id, amountCents: paidTr.amountCents, reversedCents: 500 } };
  check("a partial reversal is flagged, not applied line by line", (await pay.handleProviderEvent(partial)) === "applied" && (await pay.partialReversals(fin)).partial.length === 1);
  x5 = (await lineStates(W1)).find((x) => x.l.id === l5.id)!;
  check("…the line stays paid (never re-paid in full)", x5.s.status === "PAID");
  const full = { id: "evt_full", type: "transfer.reversed", transfer: { id: stripeId, group: paidTr.id, amountCents: paidTr.amountCents, reversedCents: paidTr.amountCents } };
  check("a full reversal applies", (await pay.handleProviderEvent(full)) === "applied");
  x5 = (await lineStates(W1)).find((x) => x.l.id === l5.id)!;
  check("…and holds the line for a person to decide", x5.s.status === "HELD" && !x5.s.payable, x5.s);
  check("the same event twice is applied once", (await pay.handleProviderEvent(full)) === "duplicate");
  check("events about unknown transfers are ignored", (await pay.handleProviderEvent({ id: "evt_x", type: "transfer.reversed", transfer: { id: "tr_x", group: null, amountCents: 1, reversedCents: 1 } })) === "ignored");
  await p.worker.update({ where: { id: W1 }, data: { payoutsEnabled: false } });
  check("account.updated switches payouts on", (await pay.handleProviderEvent({ id: "evt_acct", type: "account.updated", account: { id: acct, payoutsEnabled: true } })) === "applied" && (await p.worker.findUniqueOrThrow({ where: { id: W1 } })).payoutsEnabled);

  // --- transfer.created confirms a payment the app didn't record ---
  await pay.lineAction(fin, [l5.id], "release", null, now());
  fake.failNext("timeout-after-send");
  const lost = await pay.payWorker(fin, W1, st, null, now());
  check("(setup) a payment left sending", lost.ok && lost.outcome === "pending", lost);
  const lostId = lost.ok ? lost.transferId : "";
  check("transfer.created marks it paid", (await pay.handleProviderEvent({ id: "evt_created", type: "transfer.created", transfer: { id: fake.transfers.get(lostId)!.id, group: lostId, amountCents: 1, reversedCents: 0 } })) === "applied");
  x5 = (await lineStates(W1)).find((x) => x.l.id === l5.id)!;
  check("…paid once, with no conflict", x5.s.status === "PAID" && !x5.s.conflict, x5.s);

  // --- B1: a failed lookup never marks a payment failed ---
  const s6 = await workedShift(ENG_W1_A, 6);
  await supervisorShiftAction(supA, s6, { kind: "closeout", status: "APPROVED", reason: null }, now());
  const l6 = await p.payout.findFirstOrThrow({ where: { shiftId: s6 } });
  await pay.lineAction(fin, [l6.id], "approve", null, now());
  const expected6 = (await lineStates(W1)).filter((x) => x.s.payable).reduce((n, x) => n + x.l.amountCents, 0);
  check("the Pay button's amount must still match", !(await pay.payWorker(fin, W1, st, expected6 + 1)).ok);
  fake.failNext("timeout-after-send");
  const g6 = await pay.payWorker(fin, W1, st, expected6, now());
  const t6 = g6.ok ? g6.transferId : "";
  fake.failLookup(true);
  const chk = await pay.settleTransfer(fin, t6, st, now());
  fake.failLookup(false);
  let x6 = (await lineStates(W1)).find((x) => x.l.id === l6.id)!;
  check("a refused lookup leaves the payment sending, never failed", chk.ok && chk.outcome === "pending" && x6.s.status === "PROCESSING", { chk, s: x6.s });

  // --- B2: Stripe's confirmation wins even over a recorded failure ---
  await p.payoutEvent.create({ data: { payoutId: l6.id, type: "TRANSFER_FAILED", transferId: t6, reason: "simulated wrong failure", createdAt: new Date(Date.now() + 5) } });
  check("(setup) line looks payable after a wrong failure", (await lineStates(W1)).find((x) => x.l.id === l6.id)!.s.payable);
  await pay.handleProviderEvent({ id: "evt_b2", type: "transfer.created", transfer: { id: fake.transfers.get(t6)!.id, group: t6, amountCents: expected6, reversedCents: 0 } }, new Date(Date.now() + 10));
  x6 = (await lineStates(W1)).find((x) => x.l.id === l6.id)!;
  check("transfer.created after a recorded failure marks it paid", x6.s.status === "PAID" && !x6.s.payable, x6.s);
  check("…and is audited as paid after failure", !!(await p.auditEvent.findFirst({ where: { action: "payout.paid_after_failure", entityId: t6 } })));

  // --- S1: a reversal that arrives before the payment is confirmed ---
  const s7 = await workedShift(ENG_W1_A, 7);
  await supervisorShiftAction(supA, s7, { kind: "closeout", status: "APPROVED", reason: null }, now());
  const l7 = await p.payout.findFirstOrThrow({ where: { shiftId: s7 } });
  await pay.lineAction(fin, [l7.id], "approve", null, now());
  fake.failNext("timeout-after-send");
  const g7 = await pay.payWorker(fin, W1, st, null, now());
  const t7 = g7.ok ? g7.transferId : "";
  const tr7 = fake.transfers.get(t7)!;
  await pay.handleProviderEvent({ id: "evt_s1r", type: "transfer.reversed", transfer: { id: tr7.id, group: t7, amountCents: tr7.amountCents, reversedCents: tr7.amountCents } });
  await pay.handleProviderEvent({ id: "evt_s1c", type: "transfer.created", transfer: { id: tr7.id, group: t7, amountCents: tr7.amountCents, reversedCents: 0 } });
  const x7 = (await lineStates(W1)).find((x) => x.l.id === l7.id)!;
  check("reversal before confirmation: the line is held, not paid", x7.s.status === "HELD" && !x7.s.payable, x7.s);

  // --- S6: a dispute-adjusted shift's review is final ---
  const s8 = await workedShift(ENG_W1_A, 8);
  await supervisorShiftAction(supA, s8, { kind: "closeout", status: "APPROVED", reason: null }, now());
  await pay.openDispute({ workerId: W1, profileId: W1 }, s8, "The break was 15 minutes, not 30.");
  const d8 = await p.payDispute.findFirstOrThrow({ where: { shiftId: s8 } });
  await pay.resolveDispute(fin, d8.id, { outcome: "ADJUSTED", response: "Corrected the break.", amountCents: -100 }, now());
  check("a dispute-adjusted shift can't be re-reviewed", !(await supervisorShiftAction(supA, s8, { kind: "closeout", status: "REJECTED", reason: "x" }, now())).ok);
  const base8 = await p.payout.findFirstOrThrow({ where: { shiftId: s8, kind: "SHIFT" } });
  check("approving the shift's pay", (await pay.lineAction(fin, [base8.id], "approve", null, now())).ok);
  const ded8 = await p.payout.findFirstOrThrow({ where: { shiftId: s8, kind: "ADJUSTMENT" }, include: { events: true } });
  check("…approves its waiting deduction with it", lineState(ded8, ded8.events, false).status === "APPROVED", ded8.events);
  check("a deduction can't be held", !(await pay.lineAction(fin, [ded8.id], "hold", "trying", now())).ok);

  // --- Two people: the shift's reviewer can't approve its pay ---
  const own = { profileId: OWNER, orgId: ORG, role: "OWNER" as const };
  const s9 = await workedShift(ENG_W1_A, 9);
  await supervisorShiftAction({ profileId: OWNER, orgId: ORG }, s9, { kind: "closeout", status: "APPROVED", reason: null }, now());
  const l9 = await p.payout.findFirstOrThrow({ where: { shiftId: s9 } });
  const self = await pay.lineAction(own, [l9.id], "approve", null, now());
  check("an owner who approved the work can't approve its pay", !self.ok && /someone else/.test(self.ok ? "" : self.reason), self);
  // Re-approving with the same pay keeps the supervisor's line: the owner's
  // later review still blocks them.
  const s10 = await workedShift(ENG_W1_A, 10);
  await supervisorShiftAction(supA, s10, { kind: "closeout", status: "APPROVED", reason: null }, now());
  await supervisorShiftAction({ profileId: OWNER, orgId: ORG }, s10, { kind: "closeout", status: "APPROVED", reason: null }, now());
  const l10 = await p.payout.findFirstOrThrow({ where: { shiftId: s10 } });
  check("(setup) the kept line still points at the supervisor's review", (await p.validation.findUniqueOrThrow({ where: { id: l10.validationId! } })).reviewerId === SUP);
  check("the shift's latest reviewer can't approve, even on a kept line", !(await pay.lineAction(own, [l10.id], "approve", null, now())).ok);
  check("finance can", (await pay.lineAction(fin, [l9.id, l10.id], "approve", null, now())).ok);
  await pay.openDispute({ workerId: W1, profileId: W1 }, s10, "The second review was the right one, thanks.");
  const d10 = await p.payDispute.findFirstOrThrow({ where: { shiftId: s10 } });
  await pay.resolveDispute(fin, d10.id, { outcome: "ADJUSTED", response: "Took off the long break.", amountCents: -200 }, now());
  const ded = await p.payout.findFirstOrThrow({ where: { shiftId: s10, kind: "ADJUSTMENT" }, include: { events: true } });
  check("a deduction on approved pay applies at once", lineState(ded, ded.events, false).status === "APPROVED", ded.events);

  // --- Append-only, enforced by the database ---
  const tryWrite = async (sql: string) => p.$executeRawUnsafe(sql).then(() => false, () => true);
  check("pay lines can't be updated", await tryWrite(`UPDATE "Payout" SET "amountCents" = 1 WHERE id = '${l5.id}'`));
  check("pay events can't be deleted", await tryWrite(`DELETE FROM "PayoutEvent" WHERE "payoutId" = '${l5.id}'`));
  check("transfers can't be updated", await tryWrite(`UPDATE "PayoutTransfer" SET "amountCents" = 1`));
  check("disputes can't be deleted", await tryWrite(`DELETE FROM "PayDispute"`));
  check("pay tables can't be truncated", await tryWrite(`TRUNCATE "Payout" CASCADE`));
  check("work events can't be edited", await tryWrite(`UPDATE "WorkEvent" SET payload = '{}'`));
  check("reviews can't be deleted", await tryWrite(`DELETE FROM "Validation"`));
  check("the audit log can't be edited", await tryWrite(`UPDATE "AuditEvent" SET action = 'x'`));
  check("two shift lines for one approval are refused", await tryWrite(`INSERT INTO "Payout" (id, "workerId", "orgId", "shiftId", "validationId", kind, "amountCents") SELECT gen_random_uuid(), "workerId", "orgId", "shiftId", "validationId", 'SHIFT', 1 FROM "Payout" WHERE id = '${l5.id}'`));
}

/** Fixes from the full review. */
async function slice5(ctx: { e2: string }) {
  const p = db();
  const now = () => new Date();
  const fin = { profileId: FIN, orgId: ORG, role: "FINANCE" as const };
  const owner = { profileId: OWNER, orgId: ORG, role: "OWNER" as const };
  const w2 = { workerId: W2, profileId: W2 };
  const fake = fakeStripe();
  const st = fake.provider;
  const stateOf = async (id: string) => { const l = await p.payout.findUniqueOrThrow({ where: { id }, include: { events: true } }); return lineState(l, l.events, false); };

  // --- An approved deduction survives a second dispute (deductions always apply) ---
  const engA = (await p.engagement.findFirst({ where: { jobId: JOB_A, workerId: W2 } })) ?? (await p.engagement.create({ data: { jobId: JOB_A, workerId: W2, status: "ACTIVE", hiredById: OWNER } }));
  const sx = await workedShift(engA.id, 8);
  await supervisorShiftAction(supA, sx, { kind: "closeout", status: "APPROVED", reason: null }, now());
  const lx = await p.payout.findFirstOrThrow({ where: { shiftId: sx } });
  await pay.lineAction(fin, [lx.id], "approve", null, now());
  await pay.openDispute(w2, sx, "The break was shorter than recorded, please check.");
  const dx = await p.payDispute.findFirstOrThrow({ where: { shiftId: sx } });
  await pay.resolveDispute(fin, dx.id, { outcome: "ADJUSTED", response: "Lost a sheet; small deduction.", amountCents: -200 }, now());
  const ded = await p.payout.findFirstOrThrow({ where: { shiftId: sx, kind: "ADJUSTMENT" } });
  const second = await pay.openDispute(w2, sx, "I don't agree with the deduction at all.");
  check("(setup) a second dispute is open on the shift", second.ok, second);
  const sy = await workedShift(engA.id, 7);
  await supervisorShiftAction(supA, sy, { kind: "closeout", status: "APPROVED", reason: null }, now());
  const ly = await p.payout.findFirstOrThrow({ where: { shiftId: sy } });
  await pay.lineAction(fin, [ly.id], "approve", null, now());
  const row = (await pay.loadOrgPay(fin)).toPay.find((w) => w.workerId === W2);
  const net = row?.items.reduce((n, i) => n + i.line.amountCents, 0);
  check("the approved deduction is in the next payment despite the open dispute", !!row && row.items.some((i) => i.line.id === ded.id) && row.amountCents === net && !row.items.some((i) => i.line.id === lx.id), row && { amount: row.amountCents, items: row.items.map((i) => i.line.amountCents) });

  // --- Pay the worker; then a partial reversal is recorded in the ledger ---
  const acct = await pay.ensurePayoutAccount(W2, st);
  fake.accounts.get(acct)!.enabled = true;
  const t0 = new Date();
  const run = await pay.payWorker(fin, W2, st, null, now());
  check("(setup) pay run", run.ok && run.outcome === "paid", run);
  const trId = run.ok ? run.transferId : "";
  const tr = await p.payoutTransfer.findUniqueOrThrow({ where: { id: trId } });
  check("the transfer nets the deduction", tr.amountCents === net, { transfer: tr.amountCents, net });
  const stripeId = fake.transfers.get(trId)!.id;
  await pay.handleProviderEvent({ id: "evt_p5a", type: "transfer.reversed", transfer: { id: stripeId, group: trId, amountCents: tr.amountCents, reversedCents: 500 } });
  const listed = (await pay.partialReversals(fin)).partial.find((r) => r.transferId === trId);
  check("the partial reversal is listed with $5.00 outstanding", listed?.outstandingCents === 500, listed);
  check("a supervisor can't record it", !(await pay.recordPartialReversal({ profileId: SUP, orgId: ORG, role: "SUPERVISOR" }, trId, false)).ok);
  check("another org can't record it", !(await pay.recordPartialReversal({ profileId: OTHER, orgId: ORG2, role: "OWNER" }, trId, false)).ok);
  const rec = await pay.recordPartialReversal(fin, trId, true, now());
  check("finance records it, paying it again", rec.ok && rec.cents === 500, rec);
  const back = await p.payout.findFirstOrThrow({ where: { kind: "ADJUSTMENT", amountCents: -500, workerId: W2 } });
  const again = await p.payout.findFirstOrThrow({ where: { kind: "ADJUSTMENT", amountCents: 500, workerId: W2 } });
  check("the returned $5.00 is a settled deduction (never deducted again)", (await stateOf(back.id)).status === "PAID");
  check("the re-payment waits for approval", (await stateOf(again.id)).status === "AWAITING_APPROVAL");
  check("…not by the person who recorded it", !(await pay.lineAction(fin, [again.id], "approve", null, now())).ok);
  check("…by someone else", (await pay.lineAction(owner, [again.id], "approve", null, now())).ok);
  check("recording twice is refused", !(await pay.recordPartialReversal(fin, trId, false)).ok);
  check("nothing outstanding is listed", !(await pay.partialReversals(fin)).partial.some((r) => r.transferId === trId));
  await pay.handleProviderEvent({ id: "evt_p5b", type: "transfer.reversed", transfer: { id: stripeId, group: trId, amountCents: tr.amountCents, reversedCents: 800 } });
  check("a further reversal lists only the new $3.00", (await pay.partialReversals(fin)).partial.find((r) => r.transferId === trId)?.outstandingCents === 300);

  // --- The export includes older lines paid in the period ---
  const csv = await pay.exportLedger(fin, t0, new Date(Date.now() + 60_000));
  check("export by period includes a line recorded earlier but paid in it", ly.createdAt < t0 && csv.includes(ly.id));

  // --- A recount after approval withdraws pay worked out from the old counts ---
  const sr = await workedShift(ctx.e2, 9);
  await supervisorShiftAction(supA, sr, { kind: "batch_count", reviewed: 30, accepted: 25, rejected: 5, exceptions: null }, now());
  await supervisorShiftAction(supA, sr, { kind: "closeout", status: "APPROVED", reason: null }, now());
  const old = await p.payout.findFirstOrThrow({ where: { shiftId: sr } });
  check("(setup) per-signature pay recorded: $37.50", old.amountCents === 3750, old.amountCents);
  const rc = await supervisorShiftAction(supA, sr, { kind: "batch_count", reviewed: 30, accepted: 20, rejected: 10, exceptions: "recount" }, now());
  check("a recount before pay approval is allowed", rc.ok, rc);
  check("…and withdraws the old pay line", (await stateOf(old.id)).status === "VOIDED");
  check("…which finance can no longer approve", !(await pay.lineAction(fin, [old.id], "approve", null, now())).ok);
  check("the shift shows no recorded pay until it's approved again", (await pay.shiftPay(sr)) === null);
  await supervisorShiftAction(supA, sr, { kind: "closeout", status: "APPROVED", reason: null }, now());
  const fresh = await p.payout.findMany({ where: { shiftId: sr, kind: "SHIFT" }, orderBy: { createdAt: "asc" } });
  check("approving again records the new pay: 20 × $1.50 = $30", fresh.length === 2 && fresh[1].amountCents === 3000, fresh.map((l) => l.amountCents));
  const same = await supervisorShiftAction(supA, sr, { kind: "batch_count", reviewed: 30, accepted: 20, rejected: 10, exceptions: "same again" }, now());
  check("a recount that doesn't change pay keeps the line", same.ok && (await stateOf(fresh[1].id)).status === "AWAITING_APPROVAL");

  // --- A dispute can't adjust a shift whose pay a recount withdrew ---
  const sd = await workedShift(ctx.e2, 10);
  await supervisorShiftAction(supA, sd, { kind: "batch_count", reviewed: 10, accepted: 10, rejected: 0, exceptions: null }, now());
  await supervisorShiftAction(supA, sd, { kind: "closeout", status: "APPROVED", reason: null }, now());
  await pay.openDispute(w2, sd, "Two more sheets were accepted later, please recount.");
  await supervisorShiftAction(supA, sd, { kind: "batch_count", reviewed: 12, accepted: 12, rejected: 0, exceptions: "recount" }, now());
  const dd = await p.payDispute.findFirstOrThrow({ where: { shiftId: sd } });
  const view = (await pay.loadOrgDisputes(fin, true)).find((x) => x.id === dd.id);
  check("the dispute shows the pay was withdrawn", view?.noPayLine === true, view);
  const adj = await pay.resolveDispute(fin, dd.id, { outcome: "ADJUSTED", response: "Paying the two extra sheets.", amountCents: 300 }, now());
  check("…and can't be resolved with an adjustment until it's approved again", !adj.ok && /approves the shift again/.test(adj.ok ? "" : adj.reason), adj);
  await supervisorShiftAction(supA, sd, { kind: "closeout", status: "APPROVED", reason: null }, now());
  const sdLines = await p.payout.findMany({ where: { shiftId: sd, kind: "SHIFT" }, orderBy: { createdAt: "asc" } });
  check("after approving again the shift has its new pay ($18)", sdLines.at(-1)?.amountCents === 1800, sdLines.map((l) => l.amountCents));
  check("…and the dispute can be closed as re-reviewed", (await pay.resolveDispute(fin, dd.id, { outcome: "REREVIEWED", response: "Recounted and approved again." }, now())).ok);

  // --- A finance hold survives "not approved" → approved again ---
  const sh = await workedShift(engA.id, 11);
  await supervisorShiftAction(supA, sh, { kind: "closeout", status: "APPROVED", reason: null }, now());
  const h0 = await p.payout.findFirstOrThrow({ where: { shiftId: sh } });
  await pay.lineAction(fin, [h0.id], "hold", "Check the timesheet", now());
  await supervisorShiftAction(supA, sh, { kind: "closeout", status: "REJECTED", reason: "Wrong turf" }, now());
  await supervisorShiftAction(supA, sh, { kind: "closeout", status: "APPROVED", reason: null }, now());
  const h1 = (await p.payout.findMany({ where: { shiftId: sh, kind: "SHIFT" }, orderBy: { createdAt: "asc" } })).at(-1)!;
  const h1s = await stateOf(h1.id);
  check("the hold carries over to the line that replaces a rejected one", h1.id !== h0.id && h1s.status === "HELD" && h1s.heldReason === "Check the timesheet", h1s);

  // --- The export marks payments made in the period ---
  const header = csv.split("\r\n")[0];
  const yRow = csv.split("\r\n").find((r) => r.startsWith(`"${ly.id}"`) || r.startsWith(ly.id));
  check("the export has a paid_in_period column, yes for a line paid in the period", header.endsWith("paid_in_period") && !!yRow && /"?yes"?$/.test(yRow), { header, yRow });
}

async function main() {
  await setup();
  const ctx = await slice2();
  await slice3(ctx);
  await slice4();
  await slice5(ctx);
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
