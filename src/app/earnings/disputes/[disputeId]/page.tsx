import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorker } from "@/lib/worker-session";
import { loadDisputeThread } from "@/lib/dispute-thread-data";
import { DisputeThread } from "@/components/DisputeThread";
import { disputeMessage } from "../../actions";

export const metadata = { title: "Pay dispute · Turfcut" };

/** The worker's side of a pay dispute: the thread and its clock (M9). */
export default async function WorkerDisputePage({ params }: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = await params;
  const { workerId, userId } = await requireWorker();
  const t = await loadDisputeThread({ profileId: userId, role: "WORKER", orgId: null, workerId }, disputeId);
  if (!t) notFound();
  return (
    <main className="page max-w-2xl">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow"><Link href="/earnings" className="link">Earnings</Link></p>
          <h1 className="page-title">Your dispute</h1>
          <p className="text-muted-sm">{t.job.orgName} has three business days to reply and ten to resolve it. Pay that hasn't gone out yet waits for the outcome; a missed deadline is shown here and to them.</p>
        </div>
      </header>
      <DisputeThread t={t} send={disputeMessage} />
    </main>
  );
}
