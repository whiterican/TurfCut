import { StatusChip, StatusGlyph } from "@/components/StatusBadge";
import Link from "next/link";
import { requireArea } from "@/lib/employer-session";
import { loadReviewCandidates, REVIEW_CAP } from "@/lib/field-day-data";
import { reviewQueue } from "@/lib/field-view";
import { Masthead } from "@/components/staff/Masthead";
import { RelativeTime } from "@/components/RelativeTime";
import { ChevronLeft } from "lucide-react";

/** Shifts waiting for a closeout (C1.4), the longest-waiting first. Each opens the shift page, where the review happens. */
export default async function ReviewQueuePage() {
  const session = await requireArea("field", "read");
  const candidates = await loadReviewCandidates(session.orgId);
  const queue = reviewQueue(candidates);
  return (
    <main className="page max-w-3xl">
      <Masthead title="Review queue" meta="Checked-out shifts from the last 30 days without a closeout, or corrected since theirs, longest waiting first.">
        <Link href="/field" className="btn-ghost btn-sm"><ChevronLeft aria-hidden className="size-4 shrink-0" />In the field</Link>
      </Masthead>
      {candidates.length >= REVIEW_CAP && (
        <p className="text-hint">Showing the oldest {REVIEW_CAP} checked-out shifts; review these and the next ones appear.</p>
      )}
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
                  <StatusChip state="disputed" label="Corrected since review" className="shrink-0" />
                ) : (
                  <span className="status status-pending shrink-0"><StatusGlyph state="pending" /><span>Checked out <RelativeTime iso={r.state.checkedOutAt!.toISOString()} /></span></span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
