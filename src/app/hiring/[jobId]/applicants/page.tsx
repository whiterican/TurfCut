import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/employer-session";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { RELATIONSHIP_STATUSES, type HiringSnapshot } from "@/lib/engagements";
import { Masthead } from "@/components/staff/Masthead";
import { DataTable } from "@/components/staff/DataTable";
import { SnapshotView } from "@/components/SnapshotView";
import { loadPipelineFacts } from "@/lib/engagements-data";
import { workerStage } from "@/lib/engagements";
import { HiringActions } from "@/components/HiringActions";
import { EngagementHistory } from "@/components/EngagementHistory";
import { loadOrgAvailabilities } from "@/lib/availability-data";
import { AvailabilityStatement } from "@/components/AvailabilityStatement";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * One job's applications (C1.4, C3): who is at which stage, then the open
 * ones — applications waiting on the organization and offers waiting on the
 * worker — each with its hiring snapshot, history and next steps.
 */
export default async function ApplicantsPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) notFound();
  const session = await requireArea("hiring");
  const job = await db().job.findFirst({ where: { id: jobId, orgId: session.orgId }, select: { id: true, title: true, status: true, headcount: true } });
  if (!job) notFound();
  const engagements = await db().engagement.findMany({
    where: { jobId },
    select: { id: true, status: true, createdAt: true, applicationSnapshot: true, worker: { select: { id: true, displayName: true, closedAt: true } } },
    orderBy: { createdAt: "asc" },
  });
  // Waiting on the organization (an application) or on the worker (an offer).
  const waiting = engagements.filter((e) => e.status === "APPLIED" || e.status === "OFFERED");
  const toDecide = waiting.filter((e) => e.status === "APPLIED").length;
  const offers = waiting.length - toDecide;
  const facts = await loadPipelineFacts(engagements.map((e) => e.id));
  const now = new Date();
  const factsOf = (id: string) => facts.get(id) ?? { events: [], inReview: false, offerExpiresAt: null };
  const stage = (e: (typeof engagements)[number]) => {
    const f = factsOf(e.id);
    return workerStage(e.status, f.events, e.status === "OFFERED" && !!f.offerExpiresAt && f.offerExpiresAt <= now);
  };
  // Live, as each worker shares it with this organization now (C2.4); never scored or sorted on.
  const byWorker = await loadOrgAvailabilities(waiting.filter((e) => !e.worker.closedAt).map((e) => e.worker.id), session.orgId);
  const availability = new Map(waiting.filter((e) => byWorker.has(e.worker.id)).map((e) => [e.id, byWorker.get(e.worker.id)!] as const));

  return (
    <main className="page max-w-4xl">
      <Masthead eyebrow="Applicants" title={job.title} meta={`${engagements.length} ${engagements.length === 1 ? "person" : "people"} · ${toDecide} to decide · ${offers} ${offers === 1 ? "offer" : "offers"} out`}>
        <Link href="/hiring" className="btn-ghost btn-sm">← Pipeline</Link>
        <Link href={`/jobs/${job.id}`} className="btn-secondary btn-sm">Job page</Link>
      </Masthead>

      <DataTable
        caption={`Everyone engaged with ${job.title}`}
        empty="Nobody has applied yet."
        columns={[
          { key: "who", label: "Worker", sortable: true },
          { key: "since", label: "Arrived", sortable: true },
          { key: "stage", label: "Stage", sortable: true },
        ]}
        rows={engagements.map((e) => ({
          id: e.id,
          cells: {
            // A profile opens once the worker has engaged (C1); closed accounts show the name only.
            who: { text: e.worker.displayName, href: !e.worker.closedAt && RELATIONSHIP_STATUSES.includes(e.status) ? `/workers/${e.worker.id}` : undefined },
            since: { text: day(e.createdAt), sort: e.createdAt.getTime() },
            stage: { text: stage(e) },
          },
        }))}
      />

      <section className="section" aria-labelledby="waiting">
        <h2 id="waiting" className="section-title">Applications and offers</h2>
        {waiting.length === 0 ? (
          <p className="text-muted-sm">No applications or offers are open.</p>
        ) : (
          <ul className="space-y-3">
            {waiting.map((e) => (
              <li key={e.id} className="card space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium text-fg">
                    {e.worker.closedAt ? e.worker.displayName : <Link href={`/workers/${e.worker.id}`} className="link">{e.worker.displayName}</Link>}
                    <span className="text-muted-sm"> · {stage(e)} · applied {day(e.createdAt)}</span>
                  </p>
                </div>
                <HiringActions
                  jobId={job.id}
                  jobStatus={job.status}
                  engagementId={e.id}
                  status={e.status}
                  inReview={factsOf(e.id).inReview}
                  offerExpiresAt={factsOf(e.id).offerExpiresAt}
                />
                {availability.has(e.id) && (
                  <div className="space-y-1">
                    <p className="label">Availability now</p>
                    <AvailabilityStatement view={availability.get(e.id)!} />
                  </div>
                )}
                {e.applicationSnapshot ? <SnapshotView snapshot={e.applicationSnapshot as unknown as HiringSnapshot} /> : null}
                <EngagementHistory events={factsOf(e.id).events} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
