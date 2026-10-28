import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { loadReceipts } from "@/lib/receipts-data";
import { LocalTime } from "@/components/LocalTime";
import { money } from "@/lib/pay";
import { Masthead } from "@/components/Masthead";
import { StatusBadge } from "@/components/StatusBadge";
import { RECEIPT_STATUS } from "@/components/ReceiptView";

export const metadata = { title: "Receipts · Turfcut" };

/** Every payout the worker was ever sent, newest first (M9.2). */
export default async function ReceiptsPage() {
  const { workerId } = await requireWorker();
  const receipts = await loadReceipts(workerId);
  return (
    <main className="page max-w-2xl">
      <Masthead eyebrow={<><Link href="/earnings" className="link">Earnings</Link></>} title="Receipts" meta="One for every payment an organization started to your Stripe account, with the shifts it paid." />
      {receipts.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No payments yet</p>
          <p className="empty-state-body">When an organization sends you pay, the receipt appears here and you get a notice.</p>
        </div>
      ) : (
        <ul className="list-card">
          {receipts.map((r) => (
            <li key={r.id}>
              <Link href={`/earnings/receipts/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-surface-2">
                <span className="min-w-0 space-y-0.5">
                  <span className="block font-semibold text-fg">{r.number} · {money(r.amountCents)}</span>
                  <span className="text-muted-sm block">{r.orgName} · <LocalTime iso={(r.paidAt ?? r.createdAt).toISOString()} mode="fulldate" /> · {r.lines.length} {r.lines.length === 1 ? "line" : "lines"}</span>
                </span>
                <StatusBadge status={RECEIPT_STATUS[r.status]} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
