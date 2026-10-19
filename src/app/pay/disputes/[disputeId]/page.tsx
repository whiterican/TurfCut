import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { ORG_ROLES } from "@/lib/access";
import { loadDisputeThread } from "@/lib/dispute-thread-data";
import { DisputeThread } from "@/components/DisputeThread";
import { ResolveDispute } from "@/components/PayForms";
import { disputeMessage, resolve } from "../../actions";
import { db } from "@/lib/db";
import { hasLivePayLine } from "@/lib/pay-data";

export const metadata = { title: "Pay dispute · Turfcut" };

/** The organization's side of a pay dispute: the thread, the clock, and closing it (M9). */
export default async function OrgDisputePage({ params }: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = await params;
  const s = await requireRole(ORG_ROLES);
  const t = await loadDisputeThread({ profileId: s.userId, role: s.role, orgId: s.orgId ?? null, workerId: null }, disputeId);
  if (!t) notFound();
  // Whether a supervisor re-reviewed the shift since the dispute opened (the REREVIEWED outcome needs it).
  const reReviewed = t.canResolve ? !!(await db().validation.findFirst({ where: { shiftId: t.shift.id, workEventId: null, createdAt: { gt: t.createdAt } }, select: { id: true } })) : false;
  const noPayLine = t.canResolve ? !(await hasLivePayLine(t.shift.id)) : true;
  return (
    <main className="page max-w-2xl">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow"><Link href="/pay?tab=disputes" className="link">Pay · Disputes</Link></p>
          <h1 className="page-title">{t.worker.name}&apos;s dispute</h1>
          <p className="text-muted-sm">Reply within three business days and resolve within ten. The worker sees the same clock. Missing a deadline flags the dispute; it never decides it.</p>
        </div>
      </header>
      <DisputeThread t={t} send={disputeMessage}>
        {t.canResolve && (
          <section className="card space-y-3">
            <h2 className="text-base font-bold text-fg">Close the dispute</h2>
            <ResolveDispute action={resolve} disputeId={t.id} reReviewed={reReviewed} canAdjust={!noPayLine} />
          </section>
        )}
      </DisputeThread>
    </main>
  );
}
