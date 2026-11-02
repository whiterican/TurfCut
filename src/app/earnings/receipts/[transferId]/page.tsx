import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorker } from "@/lib/worker-session";
import { loadReceipt } from "@/lib/receipts-data";
import { ReceiptView, receiptIntro } from "@/components/ReceiptView";
import { PrintButton } from "@/components/PrintButton";
import { Masthead } from "@/components/Masthead";
import { RecordPage } from "@/components/layout/Page";

export const metadata = { title: "Receipt · Turfcut" };

/** One payout receipt (M9.2), the worker's own. */
export default async function ReceiptPage({ params }: { params: Promise<{ transferId: string }> }) {
  const { transferId } = await params;
  const { workerId } = await requireWorker();
  const r = await loadReceipt(workerId, transferId);
  if (!r) notFound();
  return (
    <RecordPage head={<Masthead eyebrow={<><Link href="/earnings/receipts" className="link no-print">Receipts</Link></>} title={<>Receipt {r.number}</>} meta={receiptIntro(r)}>
        <PrintButton />
      </Masthead>}>
      <ReceiptView r={r} />
    </RecordPage>
  );
}
