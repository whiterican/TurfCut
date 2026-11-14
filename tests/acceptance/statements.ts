/** Statement aggregation against a fresh local database; immutable synthetic ledger fixtures. */
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { loadStatement } from "@/lib/statements-data";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/turfcut_acc_st", "Use the isolated statements acceptance database");
const ORG = "00000000-0000-0000-0000-000000000001";
const WORKER = "00000000-0000-0000-0000-000000000101";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const date = (s: string) => new Date(`${s}T12:00:00Z`);

(async () => {
  const p = db();
  await p.profile.create({ data: { id: OWNER, role: "OWNER", orgId: ORG, displayName: "Statement fixture owner" } });
  const actor = { profileId: OWNER, role: "OWNER" as const, orgId: ORG };
  const a = await p.engagement.findUniqueOrThrow({ where: { id: "00000000-0000-0000-0000-000000000031" }, include: { job: true } });
  const job = await p.job.create({ data: { orgId: ORG, jurisdictionId: a.job.jurisdictionId, type: a.job.type, title: "Statement fixture second job" } });
  const b = await p.engagement.create({ data: { jobId: job.id, workerId: WORKER, status: "ACTIVE" } });
  const line = (engagementId: string, amountCents: number) => p.payout.create({ data: { orgId: ORG, workerId: WORKER, engagementId, amountCents, feeCents: amountCents / 100, createdAt: date("2026-10-05") } });
  const kept = await line(a.id, 1000);
  const early = await line(a.id, 700);
  const late = await line(b.id, 2000);
  const paidVoid = await line(b.id, 500);
  const read = async (now: string) => {
    const s = await loadStatement(actor, "2026-10", date(now));
    assert.ok(s);
    for (const key of ["grossCents", "feeCents", "lineCount"] as const) {
      assert.equal(s.campaigns.reduce((n, c) => n + c[key], 0), s.totals[key], `job ${key} reconciles to statement`);
    }
    return s;
  };
  let s = await read("2026-10-20");
  assert.deepEqual([s.status, s.totals.grossCents, s.totals.feeCents, s.totals.lineCount, s.campaigns.length], ["open", 4200, 42, 4, 2]);
  console.log("PASS two jobs reconcile gross, fees and line counts in an open statement");
  await p.payoutEvent.create({ data: { payoutId: early.id, type: "VOIDED", reason: "Local early withdrawal", createdAt: date("2026-10-09") } });
  const transfer = await p.payoutTransfer.create({ data: { orgId: ORG, workerId: WORKER, amountCents: 500, feeCents: 5, receiptNo: 1, destination: "local-fixture", createdById: OWNER, createdAt: date("2026-10-08") } });
  await p.payoutEvent.create({ data: { payoutId: paidVoid.id, type: "PAID", transferId: transfer.id, createdAt: date("2026-10-08") } });
  await p.payoutEvent.create({ data: { payoutId: paidVoid.id, type: "VOIDED", reason: "Local paid withdrawal", createdAt: date("2026-10-10") } });
  s = await read("2026-10-20");
  assert.deepEqual([s.totals.grossCents, s.totals.feeCents, s.totals.lineCount, s.totals.paidCents], [3000, 30, 2, 500]);
  assert.equal(s.lines.find(l => l.id === paidVoid.id)?.status, "PAID");
  assert.deepEqual(s.campaigns.map(c => [c.jobId, c.grossCents]), [[job.id, 2000], [a.jobId, 1000]]);
  console.log("PASS withdrawn open-month lines are excluded even when their display status remains PAID");
  s = await read("2026-11-01");
  assert.equal(s.status, "closed");
  const frozen = s.totals;
  await p.payoutEvent.create({ data: { payoutId: late.id, type: "VOIDED", reason: "Local withdrawal after close", createdAt: date("2026-11-03") } });
  s = await read("2026-11-04");
  assert.deepEqual(s.totals, frozen);
  assert.deepEqual([s.live.grossCents, s.live.feeCents, s.live.lineCount], [1000, 10, 1]);
  assert.equal(s.lines.find(l => l.id === late.id)?.withdrawnAfterClose, true);
  assert.equal(s.lines.find(l => l.id === kept.id)?.withdrawnAfterClose, false);
  const next = await loadStatement(actor, "2026-11", date("2026-11-04"));
  assert.equal(next?.totals.correctionsCents, -2000);
  assert.equal(next?.corrections.find(l => l.id === late.id)?.corrects, "S-2026-10");
  assert.equal(await p.statement.count({ where: { orgId: ORG, period: "2026-10" } }), 1);
  console.log("PASS close freezes job totals; a later withdrawal appears as a credit next month");
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db().$disconnect());
