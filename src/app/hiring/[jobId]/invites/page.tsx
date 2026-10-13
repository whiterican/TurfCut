import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/employer-session";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { INVITE_DAYS, INVITES_PER_WEEK, inviteLapsed, stageOf } from "@/lib/engagements";
import { loadPipelineFacts } from "@/lib/engagements-data";
import { hiringCounts, loadJobInvites } from "@/lib/invitations-data";
import { Masthead } from "@/components/staff/Masthead";
import { HiringTabs } from "@/components/staff/HiringTabs";
import { HiringActions } from "@/components/HiringActions";
import { EngagementHistory } from "@/components/EngagementHistory";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * One job's invitations (C3.3): who was invited and by whom, the note, the
 * deadline and what happened. Whether a worker opened an invitation is
 * never recorded or shown. Invitations are sent from a worker's page.
 */
export default async function InvitesPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) notFound();
  const session = await requireArea("hiring");
  const job = await db().job.findFirst({ where: { id: jobId, orgId: session.orgId }, select: { id: true, title: true, status: true } });
  if (!job) notFound();
  const [invites, counts] = await Promise.all([loadJobInvites(job.id, session.orgId), hiringCounts(job.id, session.orgId)]);
  const facts = await loadPipelineFacts(invites.map((i) => i.id));
  const now = new Date();
  const waiting = job.status === "CLOSED" ? 0 : invites.filter((i) => i.status === "INVITED" && !inviteLapsed(i.status, i.inviteExpiresAt, now)).length;

  return (
    <main className="page max-w-3xl">
      <Masthead eyebrow="Invites" title={job.title} meta={`${invites.length} sent · ${waiting} waiting for an answer`}>
        <Link href="/hiring" className="btn-ghost btn-sm">← Pipeline</Link>
        <Link href={`/jobs/${job.id}`} className="btn-secondary btn-sm">Job page</Link>
      </Masthead>
      <HiringTabs jobId={job.id} current="invites" counts={counts} />
      <p className="text-muted-sm">
        Invite a worker from their page once they&apos;ve applied to or worked one of your jobs. An invitation lasts {INVITE_DAYS} days, and you can send one worker at most {INVITES_PER_WEEK} a week. You&apos;re never told whether they opened it.
      </p>

      {invites.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No invitations yet</p>
          <p className="empty-state-body">Invitations you send for this job appear here.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {invites.map((i) => {
            const f = facts.get(i.id) ?? { events: [], inReview: false, offerExpiresAt: null };
            return (
              <li key={i.id} className="card space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/hiring/${job.id}/people/${i.id}`} className="link font-semibold">{i.worker.displayName}</Link>
                  <span className="badge-neutral">{stageOf(i, f, now)}</span>
                </div>
                <p className="text-muted-sm">
                  Sent {day(i.sentAt)}{i.sentBy ? ` by ${i.sentBy}` : ""}
                </p>
                <HiringActions jobId={job.id} jobStatus={job.status} engagementId={i.id} status={i.status} inReview={f.inReview} offerExpiresAt={f.offerExpiresAt} inviteExpiresAt={i.inviteExpiresAt} />
                <EngagementHistory events={f.events} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
