import Link from "next/link";
import { payShort } from "@/lib/jobs";
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
  org: { name: string; approved: boolean };
}

/** An open job (screen mockups): title with gross pay on the right, who · where · when, then tags. */
export function JobFeedCard({ j }: { j: FeedJob }) {
  const geo = (j.geography ?? {}) as { city?: string; state?: string };
  return (
    <Link transitionTypes={["nav-forward"]} href={`/jobs/${j.id}`} className="card group block space-y-3 transition hover:border-[var(--border-strong)]">
      <span className="flex items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-lg leading-snug font-bold tracking-[-0.01em] text-fg">{j.title}</span>
          <span className="mt-0.5 block text-sm text-muted">
            {[j.org.name, [geo.city, geo.state].filter(Boolean).join(", "), `${day(j.startsAt)} – ${day(j.endsAt)}`].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="max-w-[45%] shrink-0 text-right">
          <span className="block text-lg leading-snug font-bold text-fg tabular-nums">{payShort(j.compensationMethod, j.payRateCents, j.type)}</span>
          <span className="block text-xs text-subtle">gross</span>
        </span>
      </span>
      <span className="flex flex-wrap gap-1.5">
        {j.org.approved && <span className="badge-sky">Approved org</span>}
        <span className={j.type === "PETITION" ? "badge-butter" : "badge-mint"}>{j.type === "PETITION" ? "Petition" : "Canvass"}</span>
      </span>
    </Link>
  );
}
