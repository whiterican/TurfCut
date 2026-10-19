import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorker } from "@/lib/worker-session";
import { loadReceipt } from "@/lib/receipts-data";
import { ReceiptView } from "@/components/ReceiptView";
import { PrintButton } from "@/components/PrintButton";

export const metadata = { title: "Receipt · Turfcut" };

/** One payout receipt (M9.2), the worker's own. */
export default async function ReceiptPage({ params }: { params: Promise<{ transferId: string }> }) {
  const { transferId } = await params;
  const { workerId } = await requireWorker();
  const r = await loadReceipt(workerId, transferId);
  if (!r) notFound();
  return (
    <main className="page max-w-2xl">
      <header className="page-header no-print">
        <div className="space-y-1">
          <p className="eyebrow"><Link href="/earnings/receipts" className="link">Receipts</Link></p>
          <h1 className="page-title">Receipt {r.number}</h1>
          <p className="text-muted-sm">Keep it: it stays here even if the payment is later reversed, and it&apos;s in your data export.</p>
        </div>
        <PrintButton />
      </header>
      <ReceiptView r={r} />
    </main>
  );
}
