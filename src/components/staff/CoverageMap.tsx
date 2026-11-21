"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap, Polygon } from "leaflet";
import { useFieldLive } from "@/components/staff/FieldLive";
import { useTurfPick } from "@/components/staff/TurfPick";
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
export function CoverageMap({ initial, className = "h-72", names = {} }: { initial: ZoneSummary[]; className?: string; /** Each turf's name as its card says it, by zone id: what the Assign panel calls a zone picked here. */ names?: Record<string, string> }) {
  const zones = useFieldLive()?.zones ?? initial;
  // People who may assign turf can tap a zone to start the Assign panel from it (the card's button does the same for a keyboard).
  const turfPick = useTurfPick();
  const pickRef = useRef({ pick: turfPick?.pick, names, zones });
  useEffect(() => {
    pickRef.current = { pick: turfPick?.pick, names, zones };
  });
  const framed = useRef(false);
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
    const fill = token("--map-fill", "#5a3b82");
    const keep = new Set<string>();
    const added: Polygon[] = [];
    for (const z of zones) {
      keep.add(z.id);
      // Capped so the streets under a busy zone stay readable.
      const opacity = Math.min(0.5, fillOpacity(zoneFill(z)));
      let p = drawn.current.get(z.id);
      if (!p) {
        p = L.polygon(z.turf.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]), { color: stroke, weight: 2, fillColor: fill, fillOpacity: opacity, className: "coverage-zone" });
        p.bindTooltip(tip(z)).addTo(group);
        // Read at tap time, so the handler set once always sees the zone and its name as they are now.
        p.on("click", () => {
          const now = pickRef.current;
          const zone = now.zones.find((x) => x.id === z.id);
          if (now.pick && zone) now.pick({ id: zone.id, name: now.names[zone.id] ?? "this turf", turf: zone.turf });
        });
        drawn.current.set(z.id, p);
        added.push(p);
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
    // The map is framed on the zones it opened with. A turf assigned since then may lie outside that view, with its
    // card showing and nothing on the map: bring every zone into view then. Never when the new zone is already in
    // view, so a view the organizer chose isn't taken from them for nothing.
    const m = map.current;
    if (m && framed.current && added.some((p) => !m.getBounds().contains(p.getBounds()))) {
      const corners = zones.flatMap((z) => z.turf.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]));
      if (corners.length) m.fitBounds(corners, { padding: [24, 24], maxZoom: 16 });
    }
    framed.current = true;
  }, [zones, ready]);

  const onGround = zones.reduce((n, z) => n + z.onGround, 0);
  const total = zones.reduce((n, z) => n + z.total, 0);
  const label = `Coverage map: ${zones.length} ${zones.length === 1 ? "turf" : "turfs"}, ${onGround} of ${total} shifts on the ground`;
  if (failed) {
    return <p className={`turf-map coverage-map flex w-full items-center justify-center rounded-[var(--radius-card)] border border-border p-4 text-center text-muted-sm ${className}`}>The map needs signal. {label.replace("Coverage map: ", "")}.</p>;
  }
  // A region, not an image: the map's zoom buttons and attribution link inside it must stay reachable.
  return <div ref={el} data-pickable={turfPick ? "" : undefined} className={`turf-map coverage-map w-full overflow-hidden rounded-[var(--radius-card)] border border-border ${className}`} role="region" aria-label={label} />;
}
