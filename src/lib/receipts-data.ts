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
 * is judged against the amount Stripe says it sent (the report's own
 * amountCents, as the webhook judged it), falling back to Turfcut's record;
 * a report of nothing, or of the whole amount or more, isn't partial.
 */
export function partialReversals(audits: PartialAudit[], amounts: Map<string, number>): Map<string, PartReversal> {
  const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);
  const out = new Map<string, PartReversal>();
  for (const a of audits) {
    const m = (a.metadata ?? {}) as { reversedCents?: unknown; amountCents?: unknown };
    const recorded = amounts.get(a.entityId);
    if (recorded === undefined) continue;
    const cents = int(m.reversedCents) ?? 0;
    const sent = int(m.amountCents) ?? recorded;
    if (cents <= 0 || cents >= sent) continue;
    const prev = out.get(a.entityId);
    if (!prev || cents > prev.reversedCents) out.set(a.entityId, { reversedCents: cents, sentCents: sent, at: a.createdAt });
  }
  return out;
}

const partialAudits = (ids: string[]): Promise<PartialAudit[]> =>
  ids.length
    ? db().auditEvent.findMany({ where: { action: "payout.partially_reversed", entityType: "PayoutTransfer", entityId: { in: ids } }, select: { entityId: true, metadata: true, createdAt: true } })
    : Promise.resolve([]);

async function views(ts: Row[]): Promise<Receipt[]> {
  const parts = partialReversals(await partialAudits(ts.map((t) => t.id)), new Map(ts.map((t) => [t.id, t.amountCents])));
  return ts.map((t) => view(t, parts.get(t.id) ?? null));
}

function view(t: Row, part: PartReversal | null): Receipt {
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
    status,
    lines,
  };
}

/**
 * One transfer as the worker's data export states it (transfers.csv, #117):
 * the receipt's own reading, so the file and the receipt never disagree.
 * Money columns are filled only once Stripe confirmed something: a payment
 * still sending, or one that failed, has no "kept" or "reversed" figure.
 */
export const TRANSFER_EXPORT_COLUMNS = ["status", "sentAt", "failedAt", "reversedAt", "reversedCents", "keptCents", "stripeSentCents"] as const;
export function transferExportState(r: Pick<Receipt, "status" | "amountCents" | "paidAt" | "failedAt" | "reversedAt" | "partReversal">): Record<(typeof TRANSFER_EXPORT_COLUMNS)[number], string | number | Date> {
  const base = { status: r.status, sentAt: r.paidAt ?? "", failedAt: r.status === "failed" ? r.failedAt ?? "" : "", reversedAt: "" as string | Date, reversedCents: "" as string | number, keptCents: "" as string | number, stripeSentCents: "" as string | number };
  switch (r.status) {
    case "sent":
      return { ...base, reversedCents: 0, keptCents: r.amountCents };
    case "partly-reversed": {
      const p = r.partReversal!;
      // Rare: Stripe's transfer differs from Turfcut's record. The receipt then shows "Stripe sent"; so does the file, so the row adds up.
      return { ...base, reversedAt: p.at, reversedCents: p.reversedCents, keptCents: p.sentCents - p.reversedCents, stripeSentCents: p.sentCents !== r.amountCents ? p.sentCents : "" };
    }
    case "reversed":
      return { ...base, reversedAt: r.reversedAt ?? "", reversedCents: r.amountCents, keptCents: 0 };
    default:
      return base; // sending, failed: nothing settled
  }
}

/** Every receipt of the worker (no cap), for the data export. */
export async function loadAllReceipts(workerId: string): Promise<Receipt[]> {
  return views(await rows(workerId, null));
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
