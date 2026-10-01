"use client";

import { useRef, useState, useTransition } from "react";
import { turfStep } from "@/app/shifts/actions";
import { PIN_CATEGORIES, type PinCategory, type TurfPolygon } from "@/lib/field-day";
import { TurfMap, type MapPin } from "@/components/TurfMap";

const colorOf = (c: PinCategory) => PIN_CATEGORIES.find((p) => p.value === c)!.color;
const labelOf = (c: PinCategory) => PIN_CATEGORIES.find((p) => p.value === c)!.label;

export interface WorkbenchPin {
  id: string;
  lat: number;
  lng: number;
  category: PinCategory;
  label: string | null;
}

/** Map pins for display: colour by category, tooltip "Category · label". */
export function toMapPins(pins: WorkbenchPin[]): MapPin[] {
  return pins.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, color: colorOf(p.category), label: p.label ? `${labelOf(p.category)} · ${p.label}` : labelOf(p.category) }));
}

export function PinLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted" aria-label="Pin colours">
      {PIN_CATEGORIES.map((c) => (
        <li key={c.value} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: c.color }} />
          {c.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * The worker's turf for the day: the campaign's turf (or their own, if the
 * campaign didn't assign one), plus pins they drop by tapping the map.
 * Pins are deliberate marks, visible to the organization's supervisors for
 * this shift — nothing is recorded unless the worker taps.
 */
export function TurfWorkbench({
  shiftId,
  turf,
  dayTurf,
  staging,
  pins,
  canDrawDayTurf,
}: {
  shiftId: string;
  turf: TurfPolygon | null;
  dayTurf: TurfPolygon | null;
  staging: { lat: number; lng: number } | null;
  pins: WorkbenchPin[];
  canDrawDayTurf: boolean;
}) {
  const [category, setCategory] = useState<PinCategory>("good_spot");
  const [label, setLabel] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const drawForm = useRef<HTMLFormElement>(null);

  const run = (req: Parameters<typeof turfStep>[1], after?: () => void) =>
    start(async () => {
      const r = await turfStep(shiftId, req);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) after?.();
    });

  function saveDayTurf() {
    const raw = new FormData(drawForm.current!).get("turfArea");
    if (!raw) return setMsg({ ok: false, text: "Tap at least three corners first." });
    run({ kind: "day_turf", polygon: JSON.parse(String(raw)) }, () => setDrawing(false));
  }

  if (drawing) {
    return (
      <form ref={drawForm} onSubmit={(e) => e.preventDefault()} className="space-y-3">
        <p className="text-muted-sm">Tap the corners of the area you&apos;re working today.</p>
        <TurfMap editable allowStaging={false} turf={dayTurf} staging={staging} className="h-80" />
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary" disabled={pending} onClick={saveDayTurf}>
            {pending ? "Saving…" : "Save my turf"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setDrawing(false)}>
            Cancel
          </button>
        </div>
        {msg && <p role="status" className={msg.ok ? "text-success-msg" : "text-danger-msg"}>{msg.text}</p>}
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="label">Tap the map to drop a pin</legend>
        <div className="flex flex-wrap gap-2">
          {PIN_CATEGORIES.map((c) => (
            <label key={c.value} className="chip">
              <input type="radio" name="pinCategory" className="sr-only" checked={category === c.value} onChange={() => setCategory(c.value)} />
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: c.color }} />
              {c.label}
            </label>
          ))}
        </div>
        <input
          className="field"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          placeholder="Note (optional)"
          aria-label="Pin note"
        />
      </fieldset>

      <TurfMap
        turf={turf}
        dayTurf={dayTurf}
        staging={staging}
        pins={toMapPins(pins)}
        onPick={(p) => !pending && run({ kind: "pin", lat: p.lat, lng: p.lng, category, label: label || null }, () => setLabel(""))}
        className="h-80"
      />
      {msg && <p role="status" className={msg.ok ? "text-success-msg" : "text-danger-msg"}>{msg.text}</p>}
      <PinLegend />

      {canDrawDayTurf && (
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-secondary btn-sm" onClick={() => { setMsg(null); setDrawing(true); }}>
            {dayTurf ? "Redraw my turf for today" : "Mark my turf for today"}
          </button>
          {dayTurf && (
            <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => run({ kind: "day_turf", polygon: null })}>
              Clear my turf
            </button>
          )}
        </div>
      )}

      {pins.length > 0 && (
        <ul className="list-card">
          {pins.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf(p.category) }} />
                <span className="font-semibold text-fg">{labelOf(p.category)}</span>
                {p.label && <span className="truncate text-muted">{p.label}</span>}
              </span>
              <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => run({ kind: "unpin", pinId: p.id })} aria-label={`Remove ${labelOf(p.category)} pin`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-hint">Pins and your day turf are visible to this campaign&apos;s supervisors. Nothing is recorded unless you tap.</p>
    </div>
  );
}
