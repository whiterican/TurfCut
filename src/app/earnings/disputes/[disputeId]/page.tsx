import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorker } from "@/lib/worker-session";
import { loadDisputeThread } from "@/lib/dispute-thread-data";
import { DisputeThread } from "@/components/DisputeThread";
import { disputeMessage } from "../../actions";
import { Masthead } from "@/components/Masthead";

export const metadata = { title: "Pay dispute · Turfcut" };

/** The worker's side of a pay dispute: the thread and its clock (M9). */
export default async function WorkerDisputePage({ params }: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = await params;
  const { workerId, userId } = await requireWorker();
  const t = await loadDisputeThread({ profileId: userId, role: "WORKER", orgId: null, workerId }, disputeId);
  if (!t) notFound();
  return (
    <main className="page max-w-2xl">
      <Masthead eyebrow={<><Link href="/earnings" className="link">Earnings</Link></>} title="Your dispute" meta={<>{t.job.orgName} has three business days to reply and ten to resolve it. Pay that hasn&apos;t gone out yet waits for the outcome; a missed deadline is shown here and to them.</>} />
      <DisputeThread t={t} send={disputeMessage} />
    </main>
  );
}
