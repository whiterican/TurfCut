import Link from "next/link";
import { day } from "@/components/DateRangeChip";
import { payShort } from "@/lib/jobs";
import type { HiringJob } from "@/lib/campaign-social-data";

/** How many jobs show before the rest fold away. */
const SHOWN = 3;

/** "Sep 17 – Dec 16", or "From Sep 17" / "Until Dec 16" when one end is open. */
function dates(job: HiringJob): string {
  if (job.startsAt && job.endsAt) return `${day(job.startsAt)} – ${day(job.endsAt)}`;
  if (job.startsAt) return `From ${day(job.startsAt)}`;
  if (job.endsAt) return `Until ${day(job.endsAt)}`;
  return "Dates to be set";
}

function JobRow({ job, signedIn }: { job: HiringJob; signedIn: boolean }) {
  const geo = (job.geography ?? {}) as { city?: string; state?: string };
  const place = [geo.city, geo.state].filter(Boolean).join(", ");
  const href = `/jobs/${job.id}`;
  return (
    <li className="space-y-1 px-4 py-3">
      <p className="font-semibold text-fg">{job.title}</p>
      <p className="text-sm text-muted">
        {place && <>{place} · </>}
        {dates(job)}
      </p>
      <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {job.payRateCents ? (
          <span className="text-sm font-semibold text-fg tabular-nums">{payShort(job.compensationMethod, job.payRateCents, job.type)} <span className="font-normal text-muted">gross</span></span>
        ) : (
          <span className="text-sm text-muted">Rate not set</span>
        )}
        {/* The job's own page runs the application (sign-in, eligibility); this is only the way there. */}
        <Link href={signedIn ? href : `/login?next=${encodeURIComponent(href)}`} className="link text-sm font-medium" aria-label={`View job: ${job.title}`}>View job</Link>
      </p>
    </li>
  );
}

/**
 * A public campaign's jobs that are hiring now (listHiringJobs): a short
 * list, the rest folded under one control so every job stays reachable.
 */
export function HiringList({ jobs, more, signedIn }: { jobs: HiringJob[]; more: boolean; signedIn: boolean }) {
  if (jobs.length === 0) return null;
  const head = jobs.slice(0, SHOWN);
  const rest = jobs.slice(SHOWN);
  return (
    <div className="space-y-2">
      <ul className="list-card">{head.map((j) => <JobRow key={j.id} job={j} signedIn={signedIn} />)}</ul>
      {rest.length > 0 && (
        <details className="group">
          <summary className="link cursor-pointer list-none text-sm font-medium">
            <span className="group-open:hidden">Show {rest.length} more {rest.length === 1 ? "job" : "jobs"}</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <ul className="list-card mt-2">{rest.map((j) => <JobRow key={j.id} job={j} signedIn={signedIn} />)}</ul>
        </details>
      )}
      {more && <p className="text-hint">Showing the {jobs.length} most recently published.</p>}
    </div>
  );
}
