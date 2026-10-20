import type { VersionStanding } from "@/lib/admin-jurisdictions-data";

/** A jurisdiction version's standing at a glance (M10.3): in force (and whether the gate accepts it), proposed, or superseded. */
export function StandingChip({ v }: { v: { standing: VersionStanding; approved: boolean; problems: string[] } }) {
  if (v.standing === "superseded") return <span className="badge-neutral">Superseded</span>;
  if (v.standing === "proposed") return <span className="badge-butter">Proposed</span>;
  return v.problems.length ? <span className="badge-coral">Current · frozen</span> : <span className="badge-solid">Current</span>;
}
