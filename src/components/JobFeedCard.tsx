import Link from "next/link";
import { cardAffiliation, payText } from "@/lib/jobs";
import type { CompensationMethod, JobType } from "@prisma/client";

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—");

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
 * affiliation and names it, e.g. "Canvass · Democratic party".
 */
export function JobFeedCard({ j }: { j: FeedJob }) {
  const geo = (j.geography ?? {}) as { city?: string; state?: string };
  const place = [geo.city, geo.state].filter(Boolean).join(", ");
  const type = j.type === "PETITION" ? "Petition" : "Canvass";
  const aff = cardAffiliation(j.campaignDisclosure);
  return (
    <Link transitionTypes={["nav-forward"]} href={`/jobs/${j.id}`} className="card group flex flex-col gap-3 transition hover:border-[var(--border-strong)] sm:flex-row sm:items-start sm:justify-between">
      <span className="min-w-0 space-y-2">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted">
          {j.org.name}
          {place && <><span aria-hidden>·</span>{place}</>}
          {j.org.approved && <span className="badge-solid">Approved org</span>}
        </span>
        <span className="block text-base font-bold tracking-[-0.01em] text-fg">{j.title}</span>
        <span className="flex flex-wrap gap-1.5">
          <span className="badge-neutral">{day(j.startsAt)} – {day(j.endsAt)}</span>
          {aff ? (
            <span className={`badge-party badge-party-${aff.affiliation} whitespace-normal`}>{type} · {aff.label}</span>
          ) : (
            <span className="badge-neutral">{type}</span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
        <span className="text-sm font-bold text-fg tabular-nums">{payText(j.compensationMethod, j.payRateCents)}</span>
        <span className="btn-primary btn-sm">View job</span>
      </span>
    </Link>
  );
}
