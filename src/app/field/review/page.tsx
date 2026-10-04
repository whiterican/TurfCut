import Link from "next/link";
import { requireArea } from "@/lib/employer-session";
import { loadReviewCandidates } from "@/lib/field-day-data";
import { reviewQueue } from "@/lib/field-view";
import { Masthead } from "@/components/staff/Masthead";
import { RelativeTime } from "@/components/RelativeTime";

/** Shifts waiting for a closeout (C1.4), the longest-waiting first. Each opens the shift page, where the review happens. */
export default async function ReviewQueuePage() {
  const session = await requireArea("field", "read");
  const queue = reviewQueue(await loadReviewCandidates(session.orgId));
  return (
    <main className="page max-w-3xl">
      <Masthead eyebrow="Field" title="Review queue" meta="Checked-out shifts from the last 30 days without a closeout, or corrected since theirs, longest waiting first.">
        <Link href="/field" className="btn-ghost btn-sm">← In the field</Link>
      </Masthead>
      {queue.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Nothing to review</p>
          <p className="empty-state-body">Shifts show up here once the worker checks out.</p>
        </div>
      ) : (
        <ul className="list-card">
          {queue.map((r) => (
            <li key={r.shiftId}>
              <Link transitionTypes={["nav-forward"]} href={`/shifts/${r.shiftId}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition hover:bg-surface-2">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fg">{r.worker}</span>
                  <span className="block truncate text-xs text-muted">{r.jobTitle} · {r.state.signatures} signatures{r.state.packetsOut.length ? ` · ${r.state.packetsOut.length} packets not returned` : ""}</span>
                </span>
                {r.state.closeout ? (
                  <span className="badge-coral shrink-0">Corrected since review</span>
                ) : (
                  <span className="badge-butter shrink-0">Checked out <RelativeTime iso={r.state.checkedOutAt!.toISOString()} /></span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
