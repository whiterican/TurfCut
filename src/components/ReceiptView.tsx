import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { money } from "@/lib/pay";
import type { Receipt } from "@/lib/receipts-data";
import type { Status } from "@/lib/status";
import { StatusBadge } from "@/components/StatusBadge";

export const RECEIPT_STATUS: Record<Receipt["status"], Status> = {
  sending: { label: "Sending", state: "sending" },
  sent: { label: "Sent", state: "paid" },
  failed: { label: "Not sent", state: "blocked" },
  // The money arrived and Stripe later took part of it back: still a paid payment, the label says what changed.
  "partly-reversed": { label: "Sent · partly reversed", state: "paid" },
  // Final: the payment came back. Not a pause (held is "On hold" on the pay screens).
  reversed: { label: "Reversed", state: "closed" },
};

/** The line under the receipt's number, in the transfer's own state (#116 review): who paid, or why it didn't arrive. */
export function receiptIntro(r: Pick<Receipt, "status" | "orgName">): string {
  switch (r.status) {
    case "sending":
      return `${r.orgName} is sending you this payment`;
    case "sent":
      return `${r.orgName} paid you`;
    case "failed":
      return `The payment from ${r.orgName} didn't go through`;
    case "partly-reversed":
      return `Part of the payment from ${r.orgName} came back`;
    case "reversed":
      return `The payment from ${r.orgName} came back`;
  }
}

/** What the amount is, in the same state: never "sent" before Stripe confirms it. */
const AMOUNT_LABEL: Record<Receipt["status"], string> = {
  sending: "Amount being sent",
  sent: "Amount sent",
  failed: "Amount not sent",
  // The original amount stays the headline; what came back and what was kept follow it as their own rows.
  "partly-reversed": "Amount sent",
  reversed: "Amount reversed",
};

/**
 * A worker's receipt for one payout (M9.2): what was sent, where, and every
 * line it paid. A document, not a card (#114): the status, the facts as
 * aligned rows led by the amount, then the lines and total on one surface.
 * Printable.
 */
export function ReceiptView({ r }: { r: Receipt }) {
  const s = RECEIPT_STATUS[r.status];
  return (
    <article className="space-y-6">
      <StatusBadge status={s} />
      <dl className="receipt-facts">
        <dt>{AMOUNT_LABEL[r.status]}</dt>
        {/* Once Stripe confirmed it, the amount is Stripe's figure; where that differs from Turfcut's record, the record follows as its own row. */}
        <dd className="receipt-amount">{money(r.stripeSentCents ?? r.amountCents)}</dd>
        {r.stripeSentCents !== null && (
          <>
            <dt>Turfcut recorded</dt>
            <dd className="tabular-nums">{money(r.amountCents)}</dd>
            <dd className="receipt-note">Stripe confirmed a different amount from the one Turfcut recorded for this payment; the figures here are Stripe&apos;s, and the lines below add up to Turfcut&apos;s record.</dd>
          </>
        )}
        <dt>Recorded</dt>
        <dd><LocalTime iso={r.createdAt.toISOString()} mode="full" /></dd>
        {r.paidAt && (
          <>
            <dt>Sent</dt>
            <dd><LocalTime iso={r.paidAt.toISOString()} mode="full" /></dd>
          </>
        )}
        {r.partReversal && (
          <>
            <dt>Came back</dt>
            <dd className="tabular-nums">{money(r.partReversal.reversedCents)} · <LocalTime iso={r.partReversal.at.toISOString()} mode="full" /></dd>
            <dt>You kept</dt>
            <dd className="font-semibold tabular-nums">{money(r.partReversal.sentCents - r.partReversal.reversedCents)}</dd>
            <dd className="receipt-note">Stripe took back {money(r.partReversal.reversedCents)} of this payment. Once {r.orgName} records it, the same amount shows on Earnings as a deducted adjustment (not a second deduction), and anything they pay again arrives on a later receipt. The lines below are what the whole payment was for.</dd>
          </>
        )}
        {r.reversedAt && (
          <>
            <dt>Reversed</dt>
            <dd><LocalTime iso={r.reversedAt.toISOString()} mode="full" /></dd>
            <dd className="receipt-note">The money came back to {r.orgName}; the lines go out with your next payment or wait on hold.</dd>
          </>
        )}
        {r.failedAt && !r.paidAt && !r.reversedAt && (
          <>
            <dt>Not sent</dt>
            <dd><LocalTime iso={r.failedAt.toISOString()} mode="full" /></dd>
            <dd className="receipt-note">Stripe refused the transfer; {r.orgName} can send it again.</dd>
          </>
        )}
        <dt>To</dt>
        <dd>Your Stripe account (…{r.destinationTail})</dd>
        {r.providerRef && (
          <>
            <dt>Stripe reference</dt>
            <dd className="break-all">{r.providerRef}</dd>
          </>
        )}
      </dl>
      <section aria-labelledby="receipt-lines-heading" className="space-y-2">
        <h2 id="receipt-lines-heading" className="section-title">What it paid</h2>
        <ul className="list-card text-sm">
          {r.lines.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                {l.shift ? (
                  <Link href={`/shifts/${l.shift.id}`} className="link font-medium"><LocalTime iso={l.shift.startsAt.toISOString()} mode="fulldate" /></Link>
                ) : (
                  <span className="font-medium text-fg">Adjustment</span>
                )}
                {l.jobTitle && <span className="block text-xs text-muted">{l.jobTitle}</span>}
                <span className="block text-muted">
                  {l.formula}
                  {l.disputeId && (
                    <>
                      {" "}
                      <Link href={`/earnings/disputes/${l.disputeId}`} className="link text-xs">dispute</Link>
                    </>
                  )}
                </span>
              </div>
              <span className="shrink-0 text-fg tabular-nums">{money(l.amountCents)}</span>
            </li>
          ))}
          <li className="flex items-start justify-between gap-4 px-4 py-3">
            <span className="font-semibold text-fg">{r.stripeSentCents !== null ? "Total recorded" : r.status === "sent" ? "Total sent" : r.status === "partly-reversed" ? "Total sent (before the reversal)" : r.status === "reversed" ? "Total reversed" : "Total"}</span>
            <span className="font-bold text-fg tabular-nums">{money(r.amountCents)}</span>
          </li>
        </ul>
      </section>
      <p className="text-xs text-muted">Gross pay. Turfcut never takes a cut of your pay; the platform fee is charged to {r.orgName}. Every amount was fixed when it was approved and never changed after. Keep this receipt: it stays here even if the payment is later reversed, and it&apos;s in your data export.</p>
    </article>
  );
}
