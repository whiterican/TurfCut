/**
 * Worker pay receipts (M9.2): one per payout transfer, read from the ledger
 * when shown. A receipt shows gross pay only; the platform fee is the
 * organization's cost and never appears here. A receipt is the worker's
 * alone (the organization reads the same transfer on its Pay tab).
 */
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { readBasis } from "@/lib/pay";
import { receiptNumber } from "@/lib/money-views";

/**
 * "partly-reversed": Stripe took back part of a sent payment. That isn't a
 * line-by-line ledger event; Stripe's report is kept as an audit record
 * (payout.partially_reversed), which is what this reads. A later full
 * reversal supersedes it ("reversed").
 */
export type ReceiptStatus = "sending" | "sent" | "failed" | "partly-reversed" | "reversed";

export interface ReceiptLine {
  id: string;
  kind: "SHIFT" | "ADJUSTMENT";
  amountCents: number;
  formula: string;
  shift: { id: string; startsAt: Date } | null;
  jobTitle: string | null;
  /** For an adjustment made over a dispute: the dispute it came from. */
  disputeId: string | null;
}

export interface Receipt {
  id: string;
  number: string;
  orgName: string;
  amountCents: number;
  /** The Stripe account the money went to, by its last four characters. */
  destinationTail: string;
  createdAt: Date;
  paidAt: Date | null;
  reversedAt: Date | null;
  failedAt: Date | null;
  /** Stripe's transfer reference once confirmed. */
  providerRef: string | null;
  /**
   * A partial reversal: how much Stripe has confirmed it took back so far, out
   * of the amount Stripe says it sent, and when it last said so (null unless
   * partly reversed). Kept = sentCents − reversedCents.
   */
  partReversal: PartReversal | null;
  /**
   * The amount Stripe confirmed it sent, when that differs from Turfcut's
   * record (amountCents); null when they agree or Stripe hasn't said. From
   * Stripe's own reports: the payout.amount_mismatch record the webhook keeps
   * on transfer.created, else the amount on a partial-reversal report.
   */
  stripeSentCents: number | null;
  status: ReceiptStatus;
  lines: ReceiptLine[];
}

const INCLUDE = {
  org: { select: { name: true } },
  events: { orderBy: { createdAt: "asc" as const }, include: { payout: { select: { id: true, kind: true, amountCents: true, basis: true, shift: { select: { id: true, startsAt: true } }, engagement: { select: { job: { select: { title: true } } } } } } } },
} as const;

type Row = Awaited<ReturnType<typeof rows>>[number];
const rows = (workerId: string, transferId: string | null, take?: number) =>
  db().payoutTransfer.findMany({ where: { workerId, ...(transferId ? { id: transferId } : {}) }, include: INCLUDE, orderBy: { createdAt: "desc" }, take });

type PartialAudit = { entityId: string; metadata: unknown; createdAt: Date };
export type PartReversal = { reversedCents: number; sentCents: number; at: Date };

/**
 * The confirmed partial reversal per transfer from Stripe's reports. Stripe
 * reports the total reversed so far, so the largest is the latest. Partial
 * is judged against the transfer's one Stripe figure (`confirmed`, from
 * stripeAmounts), else the report's own amountCents, else Turfcut's record;
 * a report of nothing, or of the whole amount or more, isn't partial.
 */
export function partialReversals(audits: PartialAudit[], amounts: Map<string, number>, confirmed: Map<string, number> = new Map()): Map<string, PartReversal> {
  const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);
  const out = new Map<string, PartReversal>();
  for (const a of audits) {
    const m = (a.metadata ?? {}) as { reversedCents?: unknown; amountCents?: unknown };
    const recorded = amounts.get(a.entityId);
    if (recorded === undefined) continue;
    const cents = int(m.reversedCents) ?? 0;
    // One Stripe figure per transfer (stripeAmounts, passed in as `confirmed`) wins, so "sent", "came back" and "kept" always add up.
    const sent = confirmed.get(a.entityId) ?? int(m.amountCents) ?? recorded;
    if (cents <= 0 || cents >= sent) continue;
    const prev = out.get(a.entityId);
    if (!prev || cents > prev.reversedCents) out.set(a.entityId, { reversedCents: cents, sentCents: sent, at: a.createdAt });
  }
  return out;
}

type StripeAudit = PartialAudit & { action: string };

/**
 * The amount Stripe confirmed it sent, per transfer, where it differs from
 * Turfcut's record: the latest payout.amount_mismatch report (transfer.created)
 * wins; else the amount carried by a partial-reversal report. A report that
 * agrees with the record, or carries no usable amount, gives nothing.
 */
export function stripeAmounts(audits: StripeAudit[], amounts: Map<string, number>): Map<string, number> {
  const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);
  const best = new Map<string, { cents: number; rank: number; at: number }>();
  for (const a of audits) {
    const recorded = amounts.get(a.entityId);
    if (recorded === undefined) continue;
    const m = (a.metadata ?? {}) as { stripe?: unknown; amountCents?: unknown };
    const mismatch = a.action === "payout.amount_mismatch";
    const cents = mismatch ? int(m.stripe) : a.action === "payout.partially_reversed" ? int(m.amountCents) : null;
    if (cents === null) continue;
    const rank = mismatch ? 1 : 0;
    const prev = best.get(a.entityId);
    if (!prev || rank > prev.rank || (rank === prev.rank && a.createdAt.getTime() > prev.at)) best.set(a.entityId, { cents, rank, at: a.createdAt.getTime() });
  }
  const out = new Map<string, number>();
  for (const [id, b] of best) if (b.cents !== amounts.get(id)) out.set(id, b.cents);
  return out;
}

const stripeAudits = (ids: string[]): Promise<StripeAudit[]> =>
  ids.length
    ? db().auditEvent.findMany({ where: { action: { in: ["payout.partially_reversed", "payout.amount_mismatch"] }, entityType: "PayoutTransfer", entityId: { in: ids } }, select: { action: true, entityId: true, metadata: true, createdAt: true } })
    : Promise.resolve([]);

async function views(ts: Row[]): Promise<Receipt[]> {
  const audits = await stripeAudits(ts.map((t) => t.id));
  const amounts = new Map(ts.map((t) => [t.id, t.amountCents]));
  const stripe = stripeAmounts(audits, amounts);
  const parts = partialReversals(audits.filter((a) => a.action === "payout.partially_reversed"), amounts, stripe);
  return ts.map((t) => view(t, parts.get(t.id) ?? null, stripe.get(t.id) ?? null));
}

function view(t: Row, part: PartReversal | null, stripeSent: number | null): Receipt {
  const first = (type: string) => t.events.find((e) => e.type === type) ?? null;
  const paid = first("PAID");
  const reversed = first("REVERSED");
  const failed = first("TRANSFER_FAILED");
  const partReversal = reversed ? null : part;
  const status: ReceiptStatus = reversed ? "reversed" : partReversal ? "partly-reversed" : paid ? "sent" : failed ? "failed" : "sending";
  // The lines this transfer carried: one per payout line it started.
  const seen = new Set<string>();
  const lines: ReceiptLine[] = [];
  for (const e of t.events) {
    if (e.type !== "TRANSFER_STARTED" || seen.has(e.payout.id)) continue;
    seen.add(e.payout.id);
    const b = readBasis(e.payout.basis);
    const raw = (e.payout.basis ?? {}) as { disputeId?: unknown };
    lines.push({
      id: e.payout.id,
      kind: e.payout.kind,
      amountCents: e.payout.amountCents,
      formula: b.formula,
      shift: e.payout.shift ? { id: e.payout.shift.id, startsAt: e.payout.shift.startsAt } : null,
      jobTitle: e.payout.engagement?.job.title ?? null,
      disputeId: typeof raw.disputeId === "string" ? raw.disputeId : null,
    });
  }
  lines.sort((a, b) => (a.shift?.startsAt.getTime() ?? 0) - (b.shift?.startsAt.getTime() ?? 0) || (a.kind === b.kind ? 0 : a.kind === "SHIFT" ? -1 : 1));
  return {
    id: t.id,
    number: receiptNumber(t.receiptNo),
    orgName: t.org.name,
    amountCents: t.amountCents,
    destinationTail: t.destination.slice(-4),
    createdAt: t.createdAt,
    paidAt: paid?.createdAt ?? null,
    reversedAt: reversed?.createdAt ?? null,
    failedAt: failed?.createdAt ?? null,
    providerRef: paid?.providerRef ?? reversed?.providerRef ?? null,
    partReversal,
    // Only once Stripe confirmed something; a payment still sending or not sent claims no Stripe figure.
    stripeSentCents: paid || reversed || partReversal ? stripeSent : null,
    status,
    lines,
  };
}

/**
 * One transfer as the worker's data export states it (transfers.csv, #117):
 * the receipt's own reading, so the file and the receipt never disagree.
 * Money columns are filled only once Stripe confirmed something: a payment
 * still sending, or one that failed, has no "kept" or "reversed" figure.
 * Settlement figures are out of what Stripe reported sending: Turfcut's
 * record until Stripe reports a different amount, then Stripe's, which
 * stripeSentCents names; amountCents stays Turfcut's record.
 */
export const TRANSFER_EXPORT_COLUMNS = ["status", "sentAt", "failedAt", "reversedAt", "reversedCents", "keptCents", "stripeSentCents"] as const;
export function transferExportState(r: Pick<Receipt, "status" | "amountCents" | "paidAt" | "failedAt" | "reversedAt" | "partReversal" | "stripeSentCents">): Record<(typeof TRANSFER_EXPORT_COLUMNS)[number], string | number | Date> {
  const base = { status: r.status, sentAt: r.paidAt ?? "", failedAt: r.status === "failed" ? r.failedAt ?? "" : "", reversedAt: "" as string | Date, reversedCents: "" as string | number, keptCents: "" as string | number, stripeSentCents: "" as string | number };
  const sent = r.stripeSentCents ?? r.amountCents; // what Stripe confirmed, else the record (they agree)
  const named = r.stripeSentCents ?? "";
  switch (r.status) {
    case "sent":
      return { ...base, reversedCents: 0, keptCents: sent, stripeSentCents: named };
    case "partly-reversed": {
      const p = r.partReversal!;
      return { ...base, reversedAt: p.at, reversedCents: p.reversedCents, keptCents: p.sentCents - p.reversedCents, stripeSentCents: named };
    }
    case "reversed":
      return { ...base, reversedAt: r.reversedAt ?? "", reversedCents: sent, keptCents: 0, stripeSentCents: named };
    default:
      return base; // sending, failed: nothing settled
  }
}

/**
 * The worker's transfers with each one's receipt reading, oldest first, from
 * one read, for the data export: the row's own columns and its state come
 * from the same transfer, so no row can lack a state.
 */
export async function loadExportTransfers(workerId: string): Promise<Array<{ id: string; receiptNo: number; orgName: string; amountCents: number; destination: string; createdAt: Date; receipt: Receipt }>> {
  const ts = (await rows(workerId, null)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const rs = await views(ts);
  return ts.map((t, i) => ({ id: t.id, receiptNo: t.receiptNo, orgName: t.org.name, amountCents: t.amountCents, destination: t.destination, createdAt: t.createdAt, receipt: rs[i] }));
}

/** The worker's receipts, newest first. */
export async function loadReceipts(workerId: string, take = 100): Promise<Receipt[]> {
  return views(await rows(workerId, null, take));
}

/** One receipt, the worker's own; null for anyone else's. */
export async function loadReceipt(workerId: string, transferId: string): Promise<Receipt | null> {
  if (!UUID_RE.test(transferId)) return null;
  const t = (await rows(workerId, transferId, 1))[0];
  return t ? (await views([t]))[0] : null;
}
