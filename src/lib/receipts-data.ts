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

export type ReceiptStatus = "sending" | "sent" | "failed" | "reversed";

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
  status: ReceiptStatus;
  lines: ReceiptLine[];
}

const INCLUDE = {
  org: { select: { name: true } },
  events: { orderBy: { createdAt: "asc" as const }, include: { payout: { select: { id: true, kind: true, amountCents: true, basis: true, shift: { select: { id: true, startsAt: true } }, engagement: { select: { job: { select: { title: true } } } } } } } },
} as const;

type Row = Awaited<ReturnType<typeof rows>>[number];
const rows = (workerId: string, transferId?: string) =>
  db().payoutTransfer.findMany({ where: { workerId, ...(transferId ? { id: transferId } : {}) }, include: INCLUDE, orderBy: { createdAt: "desc" } });

function view(t: Row): Receipt {
  const first = (type: string) => t.events.find((e) => e.type === type) ?? null;
  const paid = first("PAID");
  const reversed = first("REVERSED");
  const failed = first("TRANSFER_FAILED");
  const status: ReceiptStatus = reversed ? "reversed" : paid ? "sent" : failed ? "failed" : "sending";
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
  lines.sort((a, b) => (a.shift?.startsAt.getTime() ?? 0) - (b.shift?.startsAt.getTime() ?? 0) || (a.kind === "SHIFT" ? -1 : 1));
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
    status,
    lines,
  };
}

/** The worker's receipts, newest first. */
export async function loadReceipts(workerId: string, take = 100): Promise<Receipt[]> {
  return (await rows(workerId)).slice(0, take).map(view);
}

/** One receipt, the worker's own; null for anyone else's. */
export async function loadReceipt(workerId: string, transferId: string): Promise<Receipt | null> {
  if (!UUID_RE.test(transferId)) return null;
  const t = (await rows(workerId, transferId))[0];
  return t ? view(t) : null;
}
