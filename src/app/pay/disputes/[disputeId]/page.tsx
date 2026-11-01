import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { loadDisputeThread } from "@/lib/dispute-thread-data";
import { DisputeThread } from "@/components/DisputeThread";
import { ResolveDispute } from "@/components/PayForms";
import { disputeMessage, resolve } from "../../actions";
import { db } from "@/lib/db";
import { hasLivePayLine } from "@/lib/pay-data";
import { Masthead } from "@/components/Masthead";
import { RecordPage } from "@/components/layout/Page";

export const metadata = { title: "Pay dispute · Turfcut" };

/** The organization's side of a pay dispute: the thread, the clock, and closing it (M9). */
export default async function OrgDisputePage({ params }: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = await params;
  // The thread decides who may see it: a pay role, or the supervisor of the shift behind the dispute.
  const s = await requireAuth();
  if (!s.orgId) redirect("/dashboard");
  const t = await loadDisputeThread({ profileId: s.userId, role: s.role, grants: s.grants, orgId: s.orgId ?? null, workerId: null }, disputeId);
  if (!t) notFound();
  // Whether a supervisor re-reviewed the shift since the dispute opened (the REREVIEWED outcome needs it).
  const reReviewed = t.canResolve ? !!(await db().validation.findFirst({ where: { shiftId: t.shift.id, workEventId: null, createdAt: { gt: t.createdAt } }, select: { id: true } })) : false;
  const noPayLine = t.canResolve ? !(await hasLivePayLine(t.shift.id)) : true;
  return (
    <RecordPage org head={<Masthead eyebrow={<><Link href="/pay?tab=disputes" className="link">Pay · Disputes</Link></>} title={<>{t.worker.name}&apos;s dispute</>} meta="Reply within three business days and resolve within ten. The worker sees the same clock. Missing a deadline flags the dispute; it never decides it." />}>
      <DisputeThread t={t} send={disputeMessage}>
        {t.canResolve && (
          <section className="card space-y-3">
            <h2 className="text-base font-bold text-fg">Close the dispute</h2>
            <ResolveDispute action={resolve} disputeId={t.id} reReviewed={reReviewed} canAdjust={!noPayLine} />
          </section>
        )}
      </DisputeThread>
    </RecordPage>
  );
}
