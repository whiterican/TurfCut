import { TurfMap, type MapPin } from "@/components/TurfMap";
import { DirectionsLink, StopFace, stopColor, streetOf, type StopView } from "@/components/stops/StopLine";
import { RecordableStop } from "@/components/stops/RecordableStop";
import { outcomeLook } from "@/lib/stop-outcomes";
import type { JobType } from "@/lib/jobs";
import type { PollQuestionView } from "@/lib/poll";

export type { StopView };

/**
 * A walkbook's numbered stops, in walking order, each in its outcome's colour.
 * With `record`, each stop opens a panel to record what happened (the worker
 * holding the book); without it, the list is read-only (staff). The map is a
 * separate piece (WalkbookMap) so a page can lay them side by side on a wide
 * screen.
 */
export function WalkbookStops({ stops, record }: { stops: StopView[]; record?: { jobType: JobType; poll?: PollQuestionView[] } }) {
  return (
    <ol className="list-card divide-y divide-border">
      {stops.map((s) =>
        record ? (
          <RecordableStop key={s.id} stop={s} jobType={record.jobType} poll={record.poll} />
        ) : (
          <li key={s.id} className="relative">
            <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: stopColor(s) }} />
            <div className="flex min-h-16 items-center gap-3 py-2 pl-4 pr-2">
              <StopFace stop={s} />
              <DirectionsLink stop={s} />
            </div>
          </li>
        )
      )}
    </ol>
  );
}

/** Whether any stop has a point from its file, so a page knows whether to lay a map beside the list. */
export const hasMapPoints = (stops: StopView[]) => stops.some((s) => s.lat !== null && s.lng !== null);

/** The stops whose file gave a point, on a map, each pin in its stop's colour. Renders nothing when none have one. */
export function WalkbookMap({ stops, className = "h-64" }: { stops: StopView[]; className?: string }) {
  const pins: MapPin[] = stops
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => ({ id: s.id, lat: s.lat!, lng: s.lng!, color: stopColor(s), label: `${s.stopNumber}. ${streetOf(s)}${s.result.outcome ? ` · ${outcomeLook(s.result.outcome).label}` : ""}` }));
  if (!pins.length) return null;
  return (
    <div className="no-print space-y-2">
      <TurfMap pins={pins} className={`${className} w-full overflow-hidden rounded-[var(--radius-card)]`} label="Map of these stops (every stop is also in the list)" />
      {pins.length < stops.length && <p className="text-hint">{pins.length} of {stops.length} stops are on the map: the file gave a point for those only.</p>}
    </div>
  );
}
