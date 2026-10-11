"use client";

import { useState } from "react";
import { TurfMap, type MapPin } from "@/components/TurfMap";
import { DEFAULT_RADIUS_M, MAX_POINTS, MAX_RADIUS_M, MIN_RADIUS_M, type StagingPoint } from "@/lib/job-launch";

type Draft = { id: string; name: string; address: string; lat: string; lng: string; radius: string };

const blank = (): Draft => ({ id: "", name: "", address: "", lat: "", lng: "", radius: String(DEFAULT_RADIUS_M) });
const fromPoint = (p: StagingPoint): Draft => ({ id: p.id, name: p.name, address: p.address ?? "", lat: p.lat.toFixed(6), lng: p.lng.toFixed(6), radius: String(p.radiusM) });

/**
 * The job's staging points (C4.2): a name, an address for the brief, the
 * spot on the map (tap to place the point being edited) and the check-in
 * radius. Each point is sent as `point_<i>_*` fields (lib/job-launch
 * validateLaunch).
 */
export function StagingPointsEditor({
  initial,
  errors,
  describe,
}: {
  initial: StagingPoint[];
  errors: Record<string, string>;
  /** Field props for an error key (aria-invalid and the error's id). */
  describe: (key: string) => { "aria-invalid"?: true; "aria-describedby"?: string };
}) {
  const [points, setPoints] = useState<Draft[]>(initial.length ? initial.map(fromPoint) : [blank()]);
  const [placing, setPlacing] = useState(0);
  const set = (i: number, patch: Partial<Draft>) => setPoints((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const err = (k: string) => (errors[k] ? <p id={`err-${k}`} className="field-error">{errors[k]}</p> : null);
  const pins: MapPin[] = points.flatMap((p, i) => (p.lat && p.lng ? [{ id: `p${i}`, lat: Number(p.lat), lng: Number(p.lng), color: i === placing ? "#2b1b3d" : "#6b7280", label: p.name || `Point ${i + 1}` }] : []));

  return (
    <div className="space-y-4 sm:col-span-2">
      {err("points")}
      <ol className="space-y-3">
        {points.map((p, i) => (
          <li key={i} className={`space-y-2 rounded-xl border p-3 ${i === placing ? "border-[var(--border-strong)]" : "border-border"}`}>
            <input type="hidden" name={`point_${i}_id`} value={p.id} />
            <input type="hidden" name={`point_${i}_lat`} value={p.lat} />
            <input type="hidden" name={`point_${i}_lng`} value={p.lng} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-fg">Staging point {i + 1}</p>
              <div className="flex gap-2">
                {i !== placing && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setPlacing(i)}>
                    Place on map
                  </button>
                )}
                {points.length > 1 && (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      setPoints((ps) => ps.filter((_, j) => j !== i));
                      setPlacing((n) => Math.max(0, n > i ? n - 1 : Math.min(n, points.length - 2)));
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1.5">
                <span className="label">Name</span>
                <input name={`point_${i}_name`} className="field" maxLength={80} value={p.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Library steps" {...describe(`point_${i}_name`)} />
                {err(`point_${i}_name`)}
              </label>
              <label className="space-y-1.5">
                <span className="label">Address <span className="font-normal text-subtle">(optional)</span></span>
                <input name={`point_${i}_address`} className="field" maxLength={200} value={p.address} onChange={(e) => set(i, { address: e.target.value })} {...describe(`point_${i}_address`)} />
                {err(`point_${i}_address`)}
              </label>
              <label className="space-y-1.5">
                <span className="label">Check-in radius (m)</span>
                <input name={`point_${i}_radius`} inputMode="numeric" className="field" value={p.radius} onChange={(e) => set(i, { radius: e.target.value })} {...describe(`point_${i}_radius`)} />
                {err(`point_${i}_radius`)}
              </label>
            </div>
            <p className="text-hint">
              {p.lat && p.lng ? `On the map at ${Number(p.lat).toFixed(4)}, ${Number(p.lng).toFixed(4)}.` : i === placing ? "Tap the map to place it." : "Not placed yet."}
            </p>
            {err(`point_${i}_lat`)}
          </li>
        ))}
      </ol>
      {points.length < MAX_POINTS && (
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => {
            setPoints((ps) => [...ps, blank()]);
            setPlacing(points.length);
          }}
        >
          Add another staging point
        </button>
      )}
      <div className="space-y-1.5">
        <span className="label">Map: tap to place staging point {placing + 1}</span>
        <TurfMap className="h-72" pins={pins} onPick={(pt) => set(placing, { lat: pt.lat.toFixed(6), lng: pt.lng.toFixed(6) })} />
        <p className="text-hint">
          Check-in counts as &ldquo;at staging&rdquo; within the radius ({MIN_RADIUS_M}–{MAX_RADIUS_M} m; {DEFAULT_RADIUS_M} m is usual). The worker&apos;s phone compares its position once and keeps only yes or no.
        </p>
      </div>
    </div>
  );
}
