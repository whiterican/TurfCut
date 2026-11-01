"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { day } from "@/components/DateRangeChip";
import { JobPhoto } from "@/components/JobPhoto";
import { CategoryStatusTag } from "@/components/CategoryStatusTag";
import { categoryStatusOf } from "@/lib/job-categories";
import { jobDiscoveryLabel, payShort } from "@/lib/jobs";

/** The labels that only repeat the kind of work, with no campaign disclosure in them. */
const PLAIN_LABELS = new Set(["Petition circulation", "Door-to-door canvassing"]);
import type { FeedJob } from "@/components/JobFeedCard";

/**
 * An open job as the concept's row (#111, screen 2): a 76×92 photograph on
 * the left, then the title (H3), the exact gross pay (14px semibold), the
 * dates and time, the place, and the organization with Turfcut's approval
 * mark. Three short-title rows and part of the next fit above the dock on a phone. The whole row is the one
 * link; Save and Hide stay SwipeCard's, beside it. Nothing the concept
 * invents is here: no distance (the app doesn't know where the worker is),
 * no "+ bonuses".
 */
export function JobPhotoRow({ j, photoUrl = null }: { j: FeedJob; photoUrl?: string | null }) {
  const geo = (j.geography ?? {}) as { city?: string; state?: string };
  const place = [geo.city, geo.state].filter(Boolean).join(", ");
  const dates = j.startsAt || j.endsAt ? `${day(j.startsAt)} – ${day(j.endsAt)}` : "Dates to be set";
  const status = categoryStatusOf(j.type, j.campaignDisclosure);
  const label = jobDiscoveryLabel(j.type, j.campaignDisclosure);
  return (
    <Link
      transitionTypes={["nav-forward"]}
      href={`/jobs/${j.id}`}
      className="job-photo-row"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
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
      <span className="job-photo-row-art">
        <JobPhoto type={j.type} src={photoUrl} sizes="76px" />
      </span>
      <span className="min-w-0 flex-1">
        <span data-share="title" className="t-section block text-fg">{j.title}</span>
        <span data-share="pay" className="block text-sm font-semibold text-fg tabular-nums">{payShort(j.compensationMethod, j.payRateCents, j.type)}</span>
        <span className="mt-1 block text-xs text-subtle">
          {dates}
          {place && ` · ${place}`}
        </span>
        {/* relative: the screen-reader label below is absolutely positioned, and must stay inside this clipped line at 320px. */}
        <span className="relative block truncate text-xs text-subtle">
          {j.org.name}
          {j.org.approved && (
            <>
              {" "}
              <BadgeCheck aria-hidden className="inline size-3.5 align-[-2px] text-fg" />
              <span className="sr-only">Approved organization</span>
            </>
          )}
        </span>
        {/* The category line only where it says more than the kind of work (#113 review, P4): a campaign's own disclosure
            (party, issue, ballot initiative, nonpartisan, candidate) or a status ("In development", "Planned") always shows;
            a plain "Petition circulation" / "Door-to-door canvassing" with nothing else to say does not. */}
        {(status !== "built" || !PLAIN_LABELS.has(label)) && (
          <span className="mt-1 flex flex-wrap items-center gap-1">
            <span className="text-xs font-medium text-subtle">{label}</span>
            <CategoryStatusTag status={status} />
          </span>
        )}
      </span>
    </Link>
  );
}
