import Link from "next/link";
import { day } from "@/components/DateRangeChip";
import { cardAffiliation, jobDiscoveryLabel, payShort } from "@/lib/jobs";
import type { FeedJob } from "@/components/JobFeedCard";

/**
 * A job as one row (F02): the same facts as the feed card, in the same
 * order, at list density. Title; organization and place; dates and the type
 * on the meta line; pay on the right in tabular figures. Today's open-jobs
 * list and every other list of jobs use it, so a job looks the same
 * everywhere it appears. The link is the whole row.
 */
export function JobRow({ j, status }: { j: FeedJob; /** A status chip for the viewer's own relation to the job, when there is one. */ status?: { label: string; badge: string } }) {
  const geo = (j.geography ?? {}) as { city?: string; state?: string };
  const place = [geo.city, geo.state].filter(Boolean).join(", ");
  const aff = cardAffiliation(j.campaignDisclosure);
  const type = jobDiscoveryLabel(j.type, j.campaignDisclosure);
  const dates = j.startsAt || j.endsAt ? `${day(j.startsAt)} – ${day(j.endsAt)}` : "Dates to be set";
  return (
    <Link transitionTypes={["nav-forward"]} href={`/jobs/${j.id}`} className="job-row">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-fg">{j.title}</span>
        <span className="block truncate text-xs text-muted">
          {j.org.name}
          {place && ` · ${place}`}
        </span>
        <span className="block truncate text-xs text-muted">
          {dates} · {aff ? `${type} · ${aff.label}` : type}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-bold text-fg tabular-nums">{payShort(j.compensationMethod, j.payRateCents, j.type)}</span>
        {status && <span className={status.badge}>{status.label}</span>}
      </span>
    </Link>
  );
}
