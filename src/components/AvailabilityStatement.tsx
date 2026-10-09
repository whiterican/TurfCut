import type { OrgAvailabilityView } from "@/lib/availability";
import { NotSharedChip } from "@/components/staff/NotSharedChip";

/** What an organization sees of a worker's availability: a plain statement, never a score. */
export function AvailabilityStatement({ view }: { view: OrgAvailabilityView }) {
  if (view === "withheld") return <NotSharedChip what="availability" />;
  if (!view || (!view.usual && view.dates.length === 0 && !view.note)) return <span className="text-muted-sm">No availability set yet.</span>;
  return (
    <span className="block space-y-1 text-sm text-fg">
      {view.usual && <span className="block">{view.usual}</span>}
      {view.dates.length > 0 && <span className="block text-muted">Coming up: {view.dates.join("; ")}.</span>}
      {view.note && <span className="block text-muted">Note: &ldquo;{view.note}&rdquo;</span>}
      <span className="block text-xs text-muted">Times are the worker&apos;s local time.</span>
    </span>
  );
}
