/**
 * Monthly statements (M9.3): one organization's calendar month of pay, for
 * its owner and finance. A statement is written once the month is over and
 * someone with a pay role first looks at it; its totals are frozen then. Its
 * lines are always read from the ledger by period, so the document can't
 * disagree with the ledger: a correction after close is a new line on the
 * next statement that names this one.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPayRole, csvCell, orgLines, type OrgLine, type PayActor } from "@/lib/pay-data";
import { readBasis, type PayStatus } from "@/lib/pay";
import { clockOf } from "@/lib/dispute-thread-data";
import { DISPUTE_SLA, type DisputeClock } from "@/lib/dispute-sla";
import { parsePeriod, periodBounds, periodClosed, periodLabel, periodOf, periodsBetween, receiptNumber, statementNumber, type Period } from "@/lib/money-views";

type Tx = Prisma.TransactionClient;
type Client = Tx | ReturnType<typeof db>;

export interface StatementTotals {
  /** Lines recorded in the month and not withdrawn when the totals were taken. */
  grossCents: number;
  feeCents: number;
  lineCount: number;
  /** Gross that reached workers in the month, and how many transfers. */
  paidCents: number;
  paidCount: number;
  /** Gross that came back (reversed) in the month. */
  reversedCents: number;
  /** Adjustments and withdrawals recorded this month to earlier months' lines (signed). */
  correctionsCents: number;
}

export interface StatementLine {
  id: string;
  kind: "SHIFT" | "ADJUSTMENT";
  workerId: string;
  worker: string;
  jobId: string | null;
  jobTitle: string | null;
  shiftId: string | null;
  shiftStartsAt: Date | null;
  formula: string;
  amountCents: number;
  feeCents: number;
  status: PayStatus;
  recordedAt: Date;
  paidAt: Date | null;
  /** The worker's receipt that paid it, when paid. */
  receipt: string | null;
  /** For a correction: the statement whose line it changes. */
  corrects: string | null;
  /** A line withdrawn (voided) after this statement closed: it counts on the next one. */
  withdrawnAfterClose: boolean;
}

export interface StatementPayment {
  transferId: string;
  receipt: string;
  workerId: string;
  worker: string;
  amountCents: number;
  paidAt: Date;
  reversedAt: Date | null;
  providerRef: string | null;
}

export interface StatementDispute {
  id: string;
  worker: string;
  jobTitle: string;
  openedAt: Date;
  resolvedAt: Date | null;
  outcome: string | null;
  clock: DisputeClock;
  /** Both deadlines met, once resolved; null while open. */
  onTime: boolean | null;
}

export interface StatementView {
  period: Period;
  number: string;
  label: string;
  /** Closed: the row exists and its totals are frozen. Open: the month is still running. */
  status: "closed" | "open";
  closedAt: Date | null;
  closedBy: string | null;
  totals: StatementTotals;
  /** The same totals read from the ledger now; differs from a closed statement's only when a line was withdrawn after close. */
  live: StatementTotals;
  campaigns: Array<{ jobId: string | null; title: string; grossCents: number; feeCents: number; lineCount: number }>;
  lines: StatementLine[];
  payments: StatementPayment[];
  corrections: StatementLine[];
  disputes: StatementDispute[];
}

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);

/** A line's VOIDED moment, if any. */
const voidedAt = (l: OrgLine): Date | null => l.line.events.find((e) => e.type === "VOIDED")?.createdAt ?? null;

interface Facts {
  recorded: OrgLine[];
  /** Lines from earlier months withdrawn in this one. */
  withdrawn: OrgLine[];
  payments: StatementPayment[];
  reversedCents: number;
  receipts: Map<string, string>;
}

async function facts(c: Client, orgId: string, period: Period): Promise<Facts> {
  const { start, end } = periodBounds(period);
  const range = { gte: start, lt: end };
  const [recorded, withdrawn, transfers, reversed] = await Promise.all([
    orgLines(c, { orgId, createdAt: range }),
    orgLines(c, { orgId, createdAt: { lt: start }, events: { some: { type: "VOIDED", createdAt: range } } }),
    c.payoutTransfer.findMany({
      where: { orgId, events: { some: { type: "PAID", createdAt: range } } },
      include: { worker: { select: { displayName: true } }, events: { where: { type: { in: ["PAID", "REVERSED"] } }, orderBy: { createdAt: "asc" } } },
      orderBy: { receiptNo: "asc" },
    }),
    c.payoutEvent.findMany({ where: { type: "REVERSED", createdAt: range, payout: { orgId } }, select: { payoutId: true, payout: { select: { amountCents: true } } } }),
  ]);
  const payments = transfers.map((t) => {
    const paid = t.events.find((e) => e.type === "PAID")!;
    const back = t.events.find((e) => e.type === "REVERSED");
    return { transferId: t.id, receipt: receiptNumber(t.receiptNo), workerId: t.workerId, worker: t.worker.displayName, amountCents: t.amountCents, paidAt: paid.createdAt, reversedAt: back?.createdAt ?? null, providerRef: paid.providerRef ?? null };
  });
  // Receipts for the lines paid in any month (a line can be paid after its own).
  const ids = [...new Set([...recorded, ...withdrawn].map((l) => l.state.transferId).filter((x): x is string => !!x))];
  const named = ids.length ? await c.payoutTransfer.findMany({ where: { id: { in: ids } }, select: { id: true, receiptNo: true } }) : [];
  const seen = new Set<string>();
  const reversedCents = sum(reversed.filter((e) => !seen.has(e.payoutId) && seen.add(e.payoutId)), (e) => e.payout.amountCents);
  return { recorded, withdrawn, payments, reversedCents, receipts: new Map(named.map((t) => [t.id, receiptNumber(t.receiptNo)])) };
}

/** The totals as they stood at `at`: a line withdrawn after `at` still counts. */
function totalsAt(f: Facts, period: Period, at: Date): StatementTotals {
  const { start } = periodBounds(period);
  const live = f.recorded.filter((l) => {
    const v = voidedAt(l);
    return !v || v > at;
  });
  const toEarlier = live.filter((l) => l.line.kind === "ADJUSTMENT" && l.line.adjusts && l.line.adjusts.createdAt < start);
  const withdrawn = f.withdrawn.filter((l) => (voidedAt(l) ?? at) <= at);
  return {
    grossCents: sum(live, (l) => l.line.amountCents),
    feeCents: sum(live, (l) => l.line.feeCents),
    lineCount: live.length,
    paidCents: sum(f.payments.filter((p) => p.paidAt <= at), (p) => p.amountCents),
    paidCount: f.payments.filter((p) => p.paidAt <= at).length,
    reversedCents: f.reversedCents,
    correctionsCents: sum(toEarlier, (l) => l.line.amountCents) - sum(withdrawn, (l) => l.line.amountCents),
  };
}

function lineView(l: OrgLine, f: Facts, period: Period, closedAt: Date | null): StatementLine {
  const { start } = periodBounds(period);
  const job = l.line.engagement?.job ?? null;
  const v = voidedAt(l);
  const earlier = l.line.kind === "ADJUSTMENT" && l.line.adjusts && l.line.adjusts.createdAt < start ? statementNumber(periodOf(l.line.adjusts.createdAt)) : null;
  const withdrawnEarlier = l.line.createdAt < start ? statementNumber(periodOf(l.line.createdAt)) : null;
  return {
    id: l.line.id,
    kind: l.line.kind,
    workerId: l.line.workerId,
    worker: l.line.worker.displayName,
    jobId: job?.id ?? null,
    jobTitle: job?.title ?? null,
    shiftId: l.line.shift?.id ?? null,
    shiftStartsAt: l.line.shift?.startsAt ?? null,
    formula: l.formula || readBasis(l.line.basis).formula,
    amountCents: l.line.amountCents,
    feeCents: l.line.feeCents,
    status: l.state.status,
    recordedAt: l.line.createdAt,
    paidAt: l.state.paidAt,
    receipt: l.state.transferId ? (f.receipts.get(l.state.transferId) ?? null) : null,
    corrects: earlier ?? withdrawnEarlier,
    withdrawnAfterClose: !!closedAt && !!v && v > closedAt,
  };
}

/** Disputes that were open at any point in the month, with their clocks. */
async function disputesIn(c: Client, orgId: string, period: Period, now: Date): Promise<StatementDispute[]> {
  const { start, end } = periodBounds(period);
  const ds = await c.payDispute.findMany({
    where: { orgId, createdAt: { lt: end }, OR: [{ resolution: { is: null } }, { resolution: { is: { createdAt: { gte: start } } } }] },
    include: {
      worker: { select: { displayName: true, profileId: true } },
      resolution: { select: { outcome: true, createdAt: true } },
      messages: { select: { authorId: true, createdAt: true } },
      shift: { select: { engagement: { select: { job: { select: { title: true } } } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return ds.map((d) => {
    const clock = clockOf(d, now);
    const onTime = d.resolution ? (clock.daysToFirstResponse ?? 0) <= DISPUTE_SLA.firstResponseDays && (clock.daysToResolution ?? 0) <= DISPUTE_SLA.resolutionDays : null;
    return { id: d.id, worker: d.worker.displayName, jobTitle: d.shift.engagement.job.title, openedAt: d.createdAt, resolvedAt: d.resolution?.createdAt ?? null, outcome: d.resolution?.outcome ?? null, clock, onTime };
  });
}

type Row = Prisma.StatementGetPayload<{ select: { id: true; closedAt: true; closedById: true; grossCents: true; feeCents: true; lineCount: true; paidCents: true; paidCount: true; reversedCents: true; correctionsCents: true } }>;

/**
 * The month's row, written now if the month is over and nobody has looked
 * yet. One writer at a time per organization; a second visitor finds the row.
 */
async function closeIfDue(actor: PayActor, period: Period, now: Date): Promise<Row | null> {
  const existing = await db().statement.findUnique({ where: { orgId_period: { orgId: actor.orgId, period } } });
  if (existing || !periodClosed(period, now)) return existing;
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`statements:${actor.orgId}`}))`;
    const again = await tx.statement.findUnique({ where: { orgId_period: { orgId: actor.orgId, period } } });
    if (again) return again;
    const t = totalsAt(await facts(tx, actor.orgId, period), period, now);
    const row = await tx.statement.create({ data: { orgId: actor.orgId, period, number: statementNumber(period), ...t, closedAt: now, closedById: actor.profileId } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "pay.statement_closed", entityType: "Statement", entityId: row.id, metadata: { period, ...t }, createdAt: now } });
    return row;
  });
}

/** One month's statement; null for a month that hasn't started or a bad period. */
export async function loadStatement(actor: PayActor, raw: unknown, now = new Date()): Promise<StatementView | null> {
  assertPayRole(actor);
  const period = parsePeriod(raw);
  if (!period || period > periodOf(now)) return null;
  const row = await closeIfDue(actor, period, now);
  const c = db();
  const [f, disputes, closer] = await Promise.all([
    facts(c, actor.orgId, period),
    disputesIn(c, actor.orgId, period, now),
    row?.closedById ? c.profile.findUnique({ where: { id: row.closedById }, select: { displayName: true } }) : null,
  ]);
  const closedAt = row?.closedAt ?? null;
  const live = totalsAt(f, period, now);
  const totals: StatementTotals = row ? { grossCents: row.grossCents, feeCents: row.feeCents, lineCount: row.lineCount, paidCents: row.paidCents, paidCount: row.paidCount, reversedCents: row.reversedCents, correctionsCents: row.correctionsCents } : live;
  const lines = f.recorded.map((l) => lineView(l, f, period, closedAt));
  const corrections = [...lines.filter((l) => l.corrects), ...f.withdrawn.map((l) => lineView(l, f, period, closedAt))];
  const byJob = new Map<string, StatementView["campaigns"][number]>();
  for (const l of lines) {
    if (l.status === "VOIDED" && !l.withdrawnAfterClose) continue;
    const key = l.jobId ?? "";
    const c0 = byJob.get(key) ?? { jobId: l.jobId, title: l.jobTitle ?? "Other pay", grossCents: 0, feeCents: 0, lineCount: 0 };
    byJob.set(key, { ...c0, grossCents: c0.grossCents + l.amountCents, feeCents: c0.feeCents + l.feeCents, lineCount: c0.lineCount + 1 });
  }
  return {
    period,
    number: statementNumber(period),
    label: periodLabel(period),
    status: row ? "closed" : "open",
    closedAt,
    closedBy: closer?.displayName ?? (row ? "Turfcut" : null),
    totals,
    live,
    campaigns: [...byJob.values()].sort((a, b) => b.grossCents - a.grossCents || a.title.localeCompare(b.title)),
    lines,
    payments: f.payments,
    corrections,
    disputes,
  };
}

export interface StatementSummary {
  period: Period;
  number: string;
  label: string;
  status: "closed" | "open";
  grossCents: number;
  paidCents: number;
}

/**
 * Every month from the organization's first pay line (or its creation) to
 * now, newest first. Months already over are closed on the way, so the list
 * is also what keeps statements current.
 */
export async function listStatements(actor: PayActor, now = new Date()): Promise<StatementSummary[]> {
  assertPayRole(actor);
  const [org, first] = await Promise.all([
    db().organization.findUniqueOrThrow({ where: { id: actor.orgId }, select: { createdAt: true } }),
    db().payout.findFirst({ where: { orgId: actor.orgId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const from = first?.createdAt ?? org.createdAt;
  const periods = periodsBetween(from < now ? from : now, now);
  const out: StatementSummary[] = [];
  for (const period of periods) {
    const row = await closeIfDue(actor, period, now);
    const t = row ?? totalsAt(await facts(db(), actor.orgId, period), period, now);
    out.push({ period, number: statementNumber(period), label: periodLabel(period), status: row ? "closed" : "open", grossCents: t.grossCents, paidCents: t.paidCents });
  }
  return out;
}

const usd = (cents: number) => (cents / 100).toFixed(2);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** The statement as CSV: the same lines, payments and corrections the page shows, then its totals. */
export function statementCsv(s: StatementView): string {
  const header = ["statement", "section", "id", "kind", "worker", "worker_id", "project", "shift_date", "calculation", "gross_usd", "platform_fee_usd", "org_cost_usd", "status", "paid_at", "receipt", "corrects_statement", "recorded_at"];
  const line = (section: string, l: StatementLine) => [
    s.number, section, l.id, l.kind, l.worker, l.workerId, l.jobTitle ?? "", day(l.shiftStartsAt), l.formula, usd(l.amountCents), usd(l.feeCents), usd(l.amountCents + l.feeCents),
    l.withdrawnAfterClose ? "WITHDRAWN_AFTER_CLOSE" : l.status, l.paidAt?.toISOString() ?? "", l.receipt ?? "", l.corrects ?? "", l.recordedAt.toISOString(),
  ];
  const rows: Array<Array<string | number>> = [
    ...s.lines.map((l) => line("recorded", l)),
    ...s.payments.map((p) => [s.number, "payment", p.transferId, "TRANSFER", p.worker, p.workerId, "", "", p.providerRef ?? "", usd(p.amountCents), "", "", p.reversedAt ? "REVERSED" : "PAID", p.paidAt.toISOString(), p.receipt, "", ""]),
    ...s.corrections.filter((l) => l.recordedAt < periodBounds(s.period).start).map((l) => line("withdrawn", l)),
    [s.number, "total", "", "RECORDED", "", "", "", "", `${s.totals.lineCount} lines`, usd(s.totals.grossCents), usd(s.totals.feeCents), usd(s.totals.grossCents + s.totals.feeCents), s.status.toUpperCase(), "", "", "", s.closedAt?.toISOString() ?? ""],
    [s.number, "total", "", "PAID", "", "", "", "", `${s.totals.paidCount} transfers`, usd(s.totals.paidCents), "", "", "", "", "", "", ""],
    [s.number, "total", "", "REVERSED", "", "", "", "", "", usd(s.totals.reversedCents), "", "", "", "", "", "", ""],
    [s.number, "total", "", "CORRECTIONS_TO_EARLIER", "", "", "", "", "", usd(s.totals.correctionsCents), "", "", "", "", "", "", ""],
  ];
  return "﻿" + [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n") + "\r\n";
}
