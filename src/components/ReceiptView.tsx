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
        <dd className="text-fg"><LocalTime iso={r.createdAt.toISOString()} /></dd>
        {r.paidAt && (
          <>
            <dt className="text-muted">Sent</dt>
            <dd className="text-fg"><LocalTime iso={r.paidAt.toISOString()} /></dd>
          </>
        )}
        {r.reversedAt && (
          <>
            <dt className="text-muted">Reversed</dt>
            <dd className="text-fg"><LocalTime iso={r.reversedAt.toISOString()} /> · the money came back to {r.orgName}; the lines go out with your next payment or wait on hold</dd>
          </>
        )}
        {r.failedAt && !r.paidAt && (
          <>
            <dt className="text-muted">Not sent</dt>
            <dd className="text-fg"><LocalTime iso={r.failedAt.toISOString()} /> · Stripe refused the transfer; {r.orgName} can send it again</dd>
          </>
        )}
        <dt className="text-muted">To</dt>
        <dd className="text-fg">Your Stripe account ending {r.destinationTail}</dd>
        {r.providerRef && (
          <>
            <dt className="text-muted">Stripe reference</dt>
            <dd className="text-fg break-all">{r.providerRef}</dd>
          </>
        )}
      </dl>
      <table className="table w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">Shift</th>
            <th className="text-left">How it was worked out</th>
            <th className="text-right">Gross</th>
          </tr>
        </thead>
        <tbody>
          {r.lines.map((l) => (
            <tr key={l.id}>
              <td className="align-top whitespace-nowrap">
                {l.shift ? (
                  <Link href={`/shifts/${l.shift.id}`} className="link"><LocalTime iso={l.shift.startsAt.toISOString()} mode="date" /></Link>
                ) : (
                  "—"
                )}
                {l.jobTitle && <span className="block text-xs text-muted">{l.jobTitle}</span>}
              </td>
              <td className="align-top text-fg">
                {l.kind === "ADJUSTMENT" ? "Adjustment: " : ""}
                {l.formula}
                {l.disputeId && (
                  <>
                    {" "}
                    <Link href={`/earnings/disputes/${l.disputeId}`} className="link text-xs">dispute</Link>
                  </>
                )}
              </td>
              <td className={`align-top text-right whitespace-nowrap tabular-nums ${l.amountCents < 0 ? "text-fg" : "text-fg"}`}>{money(l.amountCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="pt-2 text-right font-semibold text-fg">Total sent</td>
            <td className="pt-2 text-right font-bold text-fg tabular-nums">{money(r.amountCents)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="text-xs text-muted">Gross pay. Turfcut never takes a cut of your pay; the platform fee is charged to {r.orgName}. Every amount was worked out when a supervisor approved the shift and never changed after.</p>
    </article>
  );
}
