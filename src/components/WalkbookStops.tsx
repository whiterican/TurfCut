import { TurfMap, type MapPin } from "@/components/TurfMap";
import { addressLine } from "@/lib/walkbooks";

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

/**
 * A walkbook's numbered stops, in walking order, with a map of the stops
 * whose file gave a point. There is no geocoder, so a stop without one is on
 * the list only.
 */
export function WalkbookStops({ stops, map = true }: { stops: StopView[]; map?: boolean }) {
  const pins: MapPin[] = stops.filter((s) => s.lat !== null && s.lng !== null).map((s) => ({ id: String(s.stopNumber), lat: s.lat!, lng: s.lng!, color: PIN, label: `${s.stopNumber}. ${s.line1}${s.unit ? `, ${s.unit}` : ""}` }));
  return (
    <div className="space-y-3">
      {map && pins.length > 0 && (
        <>
          <div className="no-print">
            <TurfMap pins={pins} className="h-64" />
          </div>
          {pins.length < stops.length && <p className="text-hint no-print">{pins.length} of {stops.length} stops are on the map: the file gave a point for those only.</p>}
        </>
      )}
      <ol className="list-card">
        {stops.map((s) => (
          <li key={s.stopNumber} className="flex items-baseline gap-3 px-4 py-2.5">
            <span className="w-8 shrink-0 text-right font-bold tabular-nums text-fg" aria-hidden>
              {s.stopNumber}
            </span>
            <span className="min-w-0 text-sm text-fg">
              <span className="sr-only">Stop {s.stopNumber}: </span>
              {addressLine(s)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
