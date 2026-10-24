"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap, Polygon } from "leaflet";
import { useFieldLive } from "@/components/staff/FieldLive";
import { fillOpacity, zoneFill, type ZoneSummary } from "@/lib/field-live";

const token = (name: string, fallback: string) => (typeof document === "undefined" ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);

const tip = (z: ZoneSummary) => {
  const el = document.createElement("span");
  el.textContent = `${z.onGround} of ${z.total} on the ground`;
  return el;
};

/**
 * P1.7 coverage map: every turf drawn for a shift in the window, filling as
 * its workers check in and emptying as they check out. Zones only, never
 * pins: who is where is not this map's business (decision 3). Zones come
 * from the live summary, so the fills move with the figures above.
 */
export function CoverageMap({ initial, className = "h-72" }: { initial: ZoneSummary[]; className?: string }) {
  const zones = useFieldLive()?.zones ?? initial;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const drawn = useRef(new Map<string, Polygon>());
  const lib = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Create the map once, framed on every zone.
  useEffect(() => {
    let cancelled = false;
    const polygons = drawn.current;
    import("leaflet").then((L) => {
      if (cancelled || !el.current || map.current) return;
      lib.current = L;
      const m = L.map(el.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      const corners = initial.flatMap((z) => z.turf.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]));
      if (corners.length) m.fitBounds(corners, { padding: [24, 24], maxZoom: 16 });
      else m.setView([39.5, -98.35], 4);
      map.current = m;
      setReady(true);
    }, () => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      layer.current = null;
      polygons.clear();
    };
    // The first zones frame the map; later ones are drawn by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw new zones, restyle known ones (the fill transitions in CSS), drop gone ones.
  useEffect(() => {
    const L = lib.current;
    const group = layer.current;
    if (!ready || !L || !group) return;
    const stroke = token("--link", "#5a3a8a");
    const fill = token("--accent", "#ccea96");
    const keep = new Set<string>();
    for (const z of zones) {
      keep.add(z.id);
      const opacity = fillOpacity(zoneFill(z));
      let p = drawn.current.get(z.id);
      if (!p) {
        p = L.polygon(z.turf.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]), { color: stroke, weight: 2, fillColor: fill, fillOpacity: opacity, className: "coverage-zone" });
        p.bindTooltip(tip(z)).addTo(group);
        drawn.current.set(z.id, p);
      } else {
        p.setStyle({ color: stroke, fillColor: fill, fillOpacity: opacity });
        p.setTooltipContent(tip(z));
      }
    }
    for (const [id, p] of drawn.current) {
      if (!keep.has(id)) {
        group.removeLayer(p);
        drawn.current.delete(id);
      }
    }
  }, [zones, ready]);

  const onGround = zones.reduce((n, z) => n + z.onGround, 0);
  const total = zones.reduce((n, z) => n + z.total, 0);
  const label = `Coverage map: ${zones.length} ${zones.length === 1 ? "turf" : "turfs"}, ${onGround} of ${total} shifts on the ground`;
  if (failed) {
    return <p className={`turf-map coverage-map flex w-full items-center justify-center rounded-2xl border border-border p-4 text-center text-muted-sm ${className}`}>The map needs signal. {label.replace("Coverage map: ", "")}.</p>;
  }
  // A region, not an image: the map's zoom buttons and attribution link inside it must stay reachable.
  return <div ref={el} className={`turf-map coverage-map w-full overflow-hidden rounded-2xl border border-border ${className}`} role="region" aria-label={label} />;
}
