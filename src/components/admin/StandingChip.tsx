import { StatusChip } from "@/components/StatusBadge";
import type { VersionStanding } from "@/lib/admin-jurisdictions-data";

/** A jurisdiction version's standing at a glance (M10.3): in force (and whether the gate accepts it), proposed, superseded, or retired unapproved. */
export function StandingChip({ v }: { v: { standing: VersionStanding; approved: boolean; problems: string[] } }) {
  if (v.standing === "superseded") return <StatusChip state="closed" label="Superseded" />;
  if (v.standing === "retired") return <StatusChip state="closed" label="Retired" />;
  if (v.standing === "proposed") return <StatusChip state="pending" label="Proposed" />;
  return v.problems.length ? <StatusChip state="blocked" label="Current · frozen" /> : <StatusChip state="approved" label="Current" />;
}
