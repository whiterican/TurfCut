"use client";

import Link from "next/link";
import { BadgeCheck, ChevronRight } from "lucide-react";
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
 * An open job as a card, in the plan's information order (#78, 2026-10-27):
 * organization + place (with Turfcut's approval), the job title, the
 * candidate when there is one, dates and work type with the campaign's own
 * declared affiliation, then gross pay with its exact basis and a clear
 * "View job" on the last line. The whole card is the one link: no second
 * button inside it. Rendered inside SwipeCard on the feed (frame, Save, Hide).
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
      className="card-link group flex flex-col gap-3"
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
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted">
        {j.org.name}
        {place && <><span aria-hidden>·</span>{place}</>}
        {j.org.approved && (
          <span className="inline-flex items-center gap-1 text-fg">
            <BadgeCheck aria-hidden className="size-3.5 shrink-0" />
            Approved org
          </span>
        )}
      </span>
      <span className="min-w-0 space-y-1">
        <span data-share="title" className="masthead block w-fit text-lg leading-tight">{j.title}</span>
        {j.type === "CANVASS" && campaign?.campaignType === "candidate" && campaign.campaignName && (
          <span className="block text-sm font-medium text-fg">Candidate: {campaign.campaignName}</span>
        )}
      </span>
      <span className="flex flex-wrap gap-1.5">
        <DateRangeChip startsAt={j.startsAt} endsAt={j.endsAt} />
        {aff ? (
          <span className={`badge-party badge-party-${aff.affiliation}`}>{type} · {aff.label}</span>
        ) : (
          <span className="tag">{type}</span>
        )}
      </span>
      {/* Pay and the way in share the last line at every width. The whole card is the link, so the
          way in is a quiet label, not a filled button repeated on every card (one primary per view). */}
      <span className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <span data-share="pay" className="min-w-0 text-sm font-bold text-fg tabular-nums">{payText(j.compensationMethod, j.payRateCents)}</span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold whitespace-nowrap text-fg">
          View job
          <ChevronRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </Link>
  );
}
