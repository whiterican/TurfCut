import Link from "next/link";
import { DateRangeChip } from "@/components/DateRangeChip";
import { cardAffiliation, payShort } from "@/lib/jobs";
import { embedState } from "@/lib/campaign-social";
import type { PublicPost } from "@/lib/campaign-social-data";

/**
 * A job embedded in a campaign post (S1): the job as it is now, read on the
 * server. Apply opens the job's own page, where the usual application flow
 * (sign-in, eligibility, the worker's own do-not-match notice) takes over.
 * A job that has closed reads "No longer hiring", with no Apply.
 */
export function JobEmbedCard({ post, signedIn, now = new Date() }: { post: PublicPost; signedIn: boolean; now?: Date }) {
  if (!post.job) {
    return post.jobGone ? <p className="card-flat text-sm text-muted">This job is no longer hiring.</p> : null;
  }
  const j = post.job;
  const state = embedState(j, now);
  const geo = (j.geography ?? {}) as { city?: string; state?: string };
  const place = [geo.city, geo.state].filter(Boolean).join(", ");
  const type = j.type === "PETITION" ? "Petition" : "Canvass";
  const aff = cardAffiliation(j.campaignDisclosure);
  const jobHref = `/jobs/${j.id}`;
  const applyHref = signedIn ? jobHref : `/login?next=${encodeURIComponent(jobHref)}`;
  return (
    <section aria-label={`Job: ${j.title}`} className="card-flat space-y-2">
      <p className="text-xs font-semibold text-muted">Job{place ? ` · ${place}` : ""}</p>
      <p className="text-base font-bold tracking-[-0.01em] text-fg">{j.title}</p>
      <p className="flex flex-wrap gap-1.5">
        <DateRangeChip startsAt={j.startsAt} endsAt={j.endsAt} />
        {aff ? <span className={`badge-party badge-party-${aff.affiliation} whitespace-normal`}>{type} · {aff.label}</span> : <span className="tag">{type}</span>}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-bold text-fg tabular-nums">{payShort(j.compensationMethod, j.payRateCents, j.type)} <span className="font-normal text-muted">gross</span></span>
        {state === "open" ? (
          <Link href={applyHref} className="btn-primary btn-sm">Apply</Link>
        ) : (
          <span className="text-sm text-muted">{state === "paused" ? "Not taking applications right now" : "No longer hiring"}</span>
        )}
      </div>
    </section>
  );
}
