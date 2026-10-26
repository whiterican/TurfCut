import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorker } from "@/lib/worker-session";
import { loadReceipt } from "@/lib/receipts-data";
import { ReceiptView } from "@/components/ReceiptView";
import { PrintButton } from "@/components/PrintButton";
import { Masthead } from "@/components/Masthead";

export const metadata = { title: "Receipt · Turfcut" };

/** One payout receipt (M9.2), the worker's own. */
export default async function ReceiptPage({ params }: { params: Promise<{ transferId: string }> }) {
  const { transferId } = await params;
  const { workerId } = await requireWorker();
  const r = await loadReceipt(workerId, transferId);
  if (!r) notFound();
  return (
    <main className="page max-w-2xl">
      <Masthead className="no-print" eyebrow={<><Link href="/earnings/receipts" className="link">Receipts</Link></>} title={<>Receipt {r.number}</>} meta={<>Keep it: it stays here even if the payment is later reversed, and it&apos;s in your data export.</>}>
        <PrintButton />
      </Masthead>
      <ReceiptView r={r} />
    </main>
  );
}
