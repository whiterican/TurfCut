"use client";

import Link from "next/link";
import { DateRangeChip } from "@/components/DateRangeChip";
import { cardAffiliation, jobDiscoveryLabel, payText, readDisclosure } from "@/lib/jobs";
import type { CompensationMethod, JobType } from "@prisma/client";

export interface FeedJob {
  id: string;
  title: string;
  type: JobType;
  startsAt: Date | null;
  endsAt: Date | null;
  compensationMethod: CompensationMethod;
  payRateCents: number | null;
  geography: unknown;
  campaignDisclosure: unknown;
  org: { name: string; approved: boolean };
}

/**
 * An open job: who · where, the title, dates and type; gross pay and a button
 * on the right. The type chip is coloured by the campaign's own declared
 * affiliation and names it, e.g. "Canvass · Democratic party". Rendered
 * inside SwipeCard on the feed, which adds the card frame, Save and Hide.
 */
export function JobFeedCard({ j }: { j: FeedJob }) {
  const geo = (j.geography ?? {}) as { city?: string; state?: string };
  const place = [geo.city, geo.state].filter(Boolean).join(", ");
  const type = jobDiscoveryLabel(j.type, j.campaignDisclosure);
  const campaign = readDisclosure(j.campaignDisclosure);
  const aff = cardAffiliation(j.campaignDisclosure);
  return (
    <Link
      transitionTypes={["nav-forward"]}
      href={`/jobs/${j.id}`}
      className="card-link group flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
      // A mouse drag on a link starts the browser's own link drag, which cancels the swipe: off, so a swipe is a swipe.
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      // The title and pay travel to the job page (P1.6): named for the view transition only on the card that was
      // tapped, so a feed of thirty cards snapshots one. The job page names its own heading and pay the same way.
      onClick={(e) => {
        for (const [key, name] of [["title", `job-${j.id}`], ["pay", `pay-${j.id}`]] as const) {
          const el = e.currentTarget.querySelector<HTMLElement>(`[data-share="${key}"]`);
          if (el) {
            el.style.viewTransitionName = name;
            el.style.setProperty("view-transition-class", "job-share");
          }
        }
      }}
    >
      <span className="min-w-0 space-y-2">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted">
          {j.org.name}
          {place && <><span aria-hidden>·</span>{place}</>}
          {j.org.approved && <span className="badge-solid">Approved org</span>}
        </span>
        <span data-share="title" className="block w-fit text-base font-bold tracking-[-0.01em] text-fg">{j.title}</span>
        {j.type === "CANVASS" && campaign?.campaignType === "candidate" && campaign.campaignName && (
          <span className="block text-sm font-medium text-fg">Candidate: {campaign.campaignName}</span>
        )}
        <span className="flex flex-wrap gap-1.5">
          <DateRangeChip startsAt={j.startsAt} endsAt={j.endsAt} />
          {aff ? (
            <span className={`badge-party badge-party-${aff.affiliation}`}>{type} · {aff.label}</span>
          ) : (
            <span className="badge-neutral">{type}</span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center justify-between gap-3 sm:flex-col sm:items-end">
        {/* The pay wraps, never the button: "$150.00 / completed shift (gross)" beside "View job" on a phone.
            Where even its longest word won't fit beside the button, the button takes its own line. */}
        <span data-share="pay" className="flex-1 text-sm font-bold text-fg tabular-nums sm:flex-none">{payText(j.compensationMethod, j.payRateCents)}</span>
        <span className="btn-primary btn-sm shrink-0 whitespace-nowrap">View job</span>
      </span>
    </Link>
  );
}
