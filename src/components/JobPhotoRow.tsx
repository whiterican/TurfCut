"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { day } from "@/components/DateRangeChip";
import { JobArt } from "@/components/JobArt";
import { CategoryStatusTag } from "@/components/CategoryStatusTag";
import { categoryStatusOf } from "@/lib/job-categories";
import { jobDiscoveryLabel, payShort } from "@/lib/jobs";
import type { FeedJob } from "@/components/JobFeedCard";

/**
 * An open job as the green board's row: the category picture on the left,
 * then the title, the gross pay, the dates and place, and the organization
 * (with Turfcut's approval mark). Four rows fit above the dock on a phone.
 * The whole row is the one link; Save and Hide stay SwipeCard's, under it.
 * Nothing the board invents is here: no distance (the app doesn't know where
 * the worker is), no "+ bonuses".
 */
export function JobPhotoRow({ j }: { j: FeedJob }) {
  const geo = (j.geography ?? {}) as { city?: string; state?: string };
  const place = [geo.city, geo.state].filter(Boolean).join(", ");
  const dates = j.startsAt || j.endsAt ? `${day(j.startsAt)} – ${day(j.endsAt)}` : "Dates to be set";
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
        <JobArt type={j.type} />
      </span>
      <span className="min-w-0 flex-1">
        <span data-share="title" className="block text-[1.0625rem] font-bold leading-tight text-fg">{j.title}</span>
        <span data-share="pay" className="mt-0.5 block text-base font-bold text-fg tabular-nums">{payShort(j.compensationMethod, j.payRateCents, j.type)}</span>
        <span className="mt-1 block text-xs text-muted">
          {dates}
          {place && ` · ${place}`}
        </span>
        <span className="block truncate text-xs text-muted">
          {j.org.name}
          {j.org.approved && (
            <>
              {" "}
              <BadgeCheck aria-hidden className="inline size-3.5 align-[-2px] text-fg" />
              <span className="sr-only">Approved organization</span>
            </>
          )}
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          <span className="text-[11px] font-semibold text-subtle">{jobDiscoveryLabel(j.type, j.campaignDisclosure)}</span>
          <CategoryStatusTag status={categoryStatusOf(j.type, j.campaignDisclosure)} />
        </span>
      </span>
    </Link>
  );
}
