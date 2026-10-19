import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { money } from "@/lib/pay";
import type { Receipt } from "@/lib/receipts-data";

const STATUS: Record<Receipt["status"], { label: string; badge: string }> = {
  sending: { label: "Sending", badge: "badge-butter" },
  sent: { label: "Sent", badge: "badge-accent" },
  failed: { label: "Not sent", badge: "badge-coral" },
  reversed: { label: "Reversed", badge: "badge-coral" },
};

/** A worker's receipt for one payout (M9.2): what was sent, where, and every line it paid. Printable. */
export function ReceiptView({ r }: { r: Receipt }) {
  const s = STATUS[r.status];
  return (
    <article className="card space-y-4 print:border-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="eyebrow">Receipt {r.number}</p>
          <p className="text-2xl font-bold text-fg">{money(r.amountCents)}</p>
          <p className="text-muted-sm">from {r.orgName}</p>
        </div>
        <span className={s.badge}>{s.label}</span>
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Recorded</dt>
        <dd className="text-fg"><LocalTime iso={r.createdAt.toISOString()} mode="full" /></dd>
        {r.paidAt && (
          <>
            <dt className="text-muted">Sent</dt>
            <dd className="text-fg"><LocalTime iso={r.paidAt.toISOString()} mode="full" /></dd>
          </>
        )}
        {r.reversedAt && (
          <>
            <dt className="text-muted">Reversed</dt>
            <dd className="text-fg"><LocalTime iso={r.reversedAt.toISOString()} mode="full" /> · the money came back to {r.orgName}; the lines go out with your next payment or wait on hold</dd>
          </>
        )}
        {r.failedAt && !r.paidAt && (
          <>
            <dt className="text-muted">Not sent</dt>
            <dd className="text-fg"><LocalTime iso={r.failedAt.toISOString()} mode="full" /> · Stripe refused the transfer; {r.orgName} can send it again</dd>
          </>
        )}
        <dt className="text-muted">To</dt>
        <dd className="text-fg">Your Stripe account (…{r.destinationTail})</dd>
        {r.providerRef && (
          <>
            <dt className="text-muted">Stripe reference</dt>
            <dd className="text-fg break-all">{r.providerRef}</dd>
          </>
        )}
      </dl>
      <ul className="divide-y divide-border text-sm">
        {r.lines.map((l) => (
          <li key={l.id} className="flex items-start justify-between gap-4 py-2">
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
        <li className="flex items-start justify-between gap-4 pt-3">
          <span className="font-semibold text-fg">{r.status === "sent" ? "Total sent" : "Total"}</span>
          <span className="font-bold text-fg tabular-nums">{money(r.amountCents)}</span>
        </li>
      </ul>
      <p className="text-xs text-muted">Gross pay. Turfcut never takes a cut of your pay; the platform fee is charged to {r.orgName}. Every amount was fixed when it was approved and never changed after.</p>
    </article>
  );
}
