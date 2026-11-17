import { Navigation } from "lucide-react";
import { TurfMap, type MapPin } from "@/components/TurfMap";

export interface StopView {
  stopNumber: number;
  line1: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
}

/** Stop pins: one colour (Leaflet's SVG attributes can't read CSS variables); the label is the stop number and address, set as text, never HTML. */
const PIN = "#5a3a8a";

const street = (s: StopView) => `${s.line1}${s.unit ? `, ${s.unit}` : ""}`;
const place = (s: StopView) => `${s.city}, ${s.state} ${s.zip}`;
/** The phone's own maps app, opened by the reader tapping it; the address goes nowhere until then. */
const directions = (s: StopView) => `https://maps.apple.com/?q=${encodeURIComponent(`${s.line1}, ${place(s)}`)}`;

/**
 * A walkbook's numbered stops, in walking order. `stops` alone is the list;
 * the map is a separate piece (WalkbookMap) so a page can lay them side by
 * side on a wide screen. There is no geocoder: a stop without a point from
 * the file is on the list only.
 */
export function WalkbookStops({ stops }: { stops: StopView[] }) {
  return (
    <ol className="list-card divide-y divide-border">
      {stops.map((s) => (
        <li key={s.stopNumber} className="flex min-h-14 items-center gap-3 py-2 pl-3 pr-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold tabular-nums text-fg ring-1 ring-border" aria-hidden>
            {s.stopNumber}
          </span>
          <span className="min-w-0 flex-1">
            <span className="sr-only">Stop {s.stopNumber}: </span>
            <span className="block truncate font-semibold text-fg">{street(s)}</span>
            <span className="block truncate text-sm text-muted">{place(s)}</span>
          </span>
          <a
            href={directions(s)}
            target="_blank"
            rel="noopener noreferrer"
            className="no-print grid size-11 shrink-0 place-items-center rounded-full text-link hover:bg-surface-2 focus-visible:outline-2"
            aria-label={`Directions to stop ${s.stopNumber}, ${street(s)}`}
          >
            <Navigation aria-hidden className="size-5" />
          </a>
        </li>
      ))}
    </ol>
  );
}

/** Whether any stop has a point from its file, so a page knows whether to lay a map beside the list. */
export const hasMapPoints = (stops: StopView[]) => stops.some((s) => s.lat !== null && s.lng !== null);

/** The stops whose file gave a point, on a map; says how many that is. Renders nothing when none have one. */
export function WalkbookMap({ stops, className = "h-64" }: { stops: StopView[]; className?: string }) {
  const pins: MapPin[] = stops.filter((s) => s.lat !== null && s.lng !== null).map((s) => ({ id: String(s.stopNumber), lat: s.lat!, lng: s.lng!, color: PIN, label: `${s.stopNumber}. ${street(s)}` }));
  if (!pins.length) return null;
  return (
    <div className="no-print space-y-2">
      <TurfMap pins={pins} className={`${className} w-full overflow-hidden rounded-[var(--radius-card)]`} />
      {pins.length < stops.length && <p className="text-hint">{pins.length} of {stops.length} stops are on the map: the file gave a point for those only.</p>}
    </div>
  );
}
