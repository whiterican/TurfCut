"use client";

import Link from "next/link";
import { BadgeCheck, CalendarDays, MapPin } from "lucide-react";
import { day } from "@/components/DateRangeChip";
import { cardAffiliation, jobDiscoveryLabel, payShort, readDisclosure } from "@/lib/jobs";
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
 * An open job as a card (D2): the kind of work as a chip, then the title
 * with the gross pay on the right (the two things scanned first), the
 * candidate when there is one, and icon rows for who (with Turfcut's
 * approval), where and when. The whole card is the link. Rendered inside
 * SwipeCard on the feed, which adds the frame, Save and Hide.
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
      {/* What kind of work, in the campaign's own declared words (a party chip names the party). */}
      <span className="flex flex-wrap gap-1.5">
        {aff ? (
          <span className={`badge-party badge-party-${aff.affiliation}`}>{type} · {aff.label}</span>
        ) : (
          <span className="badge-neutral">{type}</span>
        )}
      </span>
      {/* The title and the gross pay on one line: the two things a worker scans for first. */}
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 space-y-1">
          <span data-share="title" className="masthead block w-fit text-lg leading-tight">{j.title}</span>
          {j.type === "CANVASS" && campaign?.campaignType === "candidate" && campaign.campaignName && (
            <span className="block text-sm font-medium text-fg">Candidate: {campaign.campaignName}</span>
          )}
        </span>
        <span className="shrink-0 text-end">
          <span data-share="pay" className="block text-base font-bold text-fg tabular-nums">{payShort(j.compensationMethod, j.payRateCents, j.type)}</span>
          {!!j.payRateCents && <span className="block text-xs text-muted">gross</span>}
        </span>
      </span>
      <span className="fact-rows">
        <span className="fact-row font-medium text-fg">
          {j.org.name}
          {j.org.approved && (
            <span className="inline-flex items-center gap-1 text-muted">
              <BadgeCheck aria-hidden className="size-4 shrink-0 text-fg" />
              <span>Approved org</span>
            </span>
          )}
        </span>
        <span className="fact-row">
          <MapPin aria-hidden className="size-4 shrink-0" />
          {place || "Place to be set"}
        </span>
        <span className="fact-row">
          <CalendarDays aria-hidden className="size-4 shrink-0" />
          {j.startsAt || j.endsAt ? `${day(j.startsAt)} – ${day(j.endsAt)}` : "Dates to be set"}
        </span>
      </span>
    </Link>
  );
}
