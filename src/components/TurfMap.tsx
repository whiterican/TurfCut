"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { LatLngExpression, LayerGroup, Map as LeafletMap } from "leaflet";
import type { TurfPolygon } from "@/lib/field-day";

type Point = { lat: number; lng: number };
export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label: string;
}

const STROKE = "#2b6534";
const FILL = "#c6ec8c";
const US_CENTER: LatLngExpression = [39.5, -98.35];

/**
 * Tooltip content as a DOM node with textContent. Leaflet inserts string
 * tooltips as HTML, so user-written text (pin labels) must never be passed
 * as a string.
 */
const tip = (text: string) => {
  const el = document.createElement("span");
  el.textContent = text;
  return el;
};

/** GeoJSON ring is [lng, lat] and closed; the editor works in open [lat, lng]. */
const fromTurf = (t: TurfPolygon | null): Point[] => (t ? t.coordinates[0].slice(0, -1).map(([lng, lat]) => ({ lat, lng })) : []);
const toTurf = (pts: Point[]): TurfPolygon | null =>
  pts.length < 3 ? null : { type: "Polygon", coordinates: [[...pts, pts[0]].map((p) => [Number(p.lng.toFixed(6)), Number(p.lat.toFixed(6))] as [number, number])] };

/**
 * Turf map. Read-only for workers and supervisors; `editable` lets an
 * organizer draw the turf (tap to add corners) and place the staging point.
 * Map tiles come from OpenStreetMap. Nobody's location is tracked: "Use my
 * location" only centres the organizer's own view and is never sent anywhere.
 */
export function TurfMap({
  turf = null,
  staging = null,
  editable = false,
  allowStaging = true,
  dayTurf = null,
  pins = [],
  onPick,
  dayTurfLabel = "Your turf today",
  className = "h-72",
}: {
  turf?: TurfPolygon | null;
  staging?: Point | null;
  editable?: boolean;
  /** With `editable`: offer the staging-point tools (organizers only). */
  allowStaging?: boolean;
  /** The worker's own turf for the day, drawn dashed. */
  dayTurf?: TurfPolygon | null;
  pins?: MapPin[];
  /** Tap-to-pin: called with the tapped point instead of editing. */
  onPick?: (p: Point) => void;
  /** Tooltip for the day turf ("Your turf today" / "Worker's turf today"). */
  dayTurfLabel?: string;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const lib = useRef<typeof import("leaflet") | null>(null);
  const [points, setPoints] = useState<Point[]>(() => fromTurf(turf));
  const [stage, setStage] = useState<Point | null>(staging);
  const [mode, setMode] = useState<"turf" | "staging">(turf || !editable || !allowStaging ? "turf" : "staging");
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);
  const [ready, setReady] = useState(false);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current || map.current) return;
      lib.current = L;
      const m = L.map(el.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      const bounds = [...fromTurf(turf), ...fromTurf(dayTurf), ...(staging ? [staging] : []), ...pins].map((p) => [p.lat, p.lng] as [number, number]);
      if (bounds.length > 1) m.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
      else if (bounds.length === 1) m.setView(bounds[0], 16);
      else m.setView(US_CENTER, 4);
      m.on("click", (e) => {
        const p = { lat: e.latlng.lat, lng: e.latlng.lng };
        if (pickRef.current) return pickRef.current(p);
        if (!editable) return;
        if (modeRef.current === "turf") setPoints((xs) => (xs.length >= 499 ? xs : [...xs, p]));
        else setStage(p);
      });
      map.current = m;
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // The initial view only; later edits redraw below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw turf and staging whenever they change.
  useEffect(() => {
    const L = lib.current;
    if (!ready || !L || !layer.current) return;
    layer.current.clearLayers();
    const latlngs = points.map((p) => [p.lat, p.lng] as [number, number]);
    if (latlngs.length >= 3) L.polygon(latlngs, { color: STROKE, weight: 2, fillColor: FILL, fillOpacity: 0.35 }).addTo(layer.current);
    else if (latlngs.length === 2) L.polyline(latlngs, { color: STROKE, weight: 2, dashArray: "4 4" }).addTo(layer.current);
    if (editable) for (const ll of latlngs) L.circleMarker(ll, { radius: 4, color: STROKE, weight: 2, fillColor: "#fff", fillOpacity: 1 }).addTo(layer.current);
    const day = fromTurf(dayTurf).map((p) => [p.lat, p.lng] as [number, number]);
    if (day.length >= 3) L.polygon(day, { color: STROKE, weight: 2, dashArray: "6 6", fillColor: FILL, fillOpacity: 0.18 }).bindTooltip(tip(dayTurfLabel)).addTo(layer.current);
    if (stage) {
      L.circleMarker([stage.lat, stage.lng], { radius: 9, color: "#17201a", weight: 3, fillColor: FILL, fillOpacity: 1 })
        .bindTooltip(tip("Staging"))
        .addTo(layer.current);
    }
    for (const pin of pins) {
      // bubblingMouseEvents: tapping a pin shows its label, it doesn't drop another pin.
      L.circleMarker([pin.lat, pin.lng], { radius: 8, color: "#ffffff", weight: 2, fillColor: pin.color, fillOpacity: 1, bubblingMouseEvents: false })
        .bindTooltip(tip(pin.label))
        .addTo(layer.current);
    }
  }, [points, stage, ready, editable, dayTurf, pins, dayTurfLabel]);

  const turfJson = toTurf(points);

  return (
    <div className="space-y-2">
      <div ref={el} className={`turf-map w-full overflow-hidden rounded-2xl border border-border ${className}`} role="img" aria-label={editable ? "Map: tap to draw the turf" : "Map of the assigned turf"} />
      {editable && (
        <>
          <input type="hidden" name="turfArea" value={turfJson ? JSON.stringify(turfJson) : ""} />
          {allowStaging && (
            <>
              <input type="hidden" name="stagingLat" value={stage ? stage.lat.toFixed(6) : ""} />
              <input type="hidden" name="stagingLng" value={stage ? stage.lng.toFixed(6) : ""} />
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {allowStaging && (
              <>
                <label className="chip">
                  <input type="radio" name="mapMode" className="sr-only" checked={mode === "turf"} onChange={() => setMode("turf")} />
                  Draw turf
                </label>
                <label className="chip">
                  <input type="radio" name="mapMode" className="sr-only" checked={mode === "staging"} onChange={() => setMode("staging")} />
                  Place staging point
                </label>
              </>
            )}
            <button type="button" className="btn-ghost btn-sm" disabled={!points.length} onClick={() => setPoints((xs) => xs.slice(0, -1))}>
              Undo corner
            </button>
            <button type="button" className="btn-ghost btn-sm" disabled={!points.length} onClick={() => setPoints([])}>
              Clear turf
            </button>
            {allowStaging && (
              <button type="button" className="btn-ghost btn-sm" disabled={!stage} onClick={() => setStage(null)}>
                Remove staging point
              </button>
            )}
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() =>
                navigator.geolocation?.getCurrentPosition((pos) => map.current?.setView([pos.coords.latitude, pos.coords.longitude], 15))
              }
            >
              Use my location
            </button>
          </div>
          <p className="text-hint">
            {mode === "turf" ? "Tap the map to add the turf's corners (3 or more)." : "Tap the map where workers check in."}{" "}
            {turfJson ? `Turf: ${points.length} corners.` : "No turf drawn."}{" "}
            {allowStaging && (stage ? "Staging point set." : "No staging point — check-in won't compare locations.")}
          </p>
        </>
      )}
    </div>
  );
}
