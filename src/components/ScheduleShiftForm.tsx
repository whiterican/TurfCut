"use client";

import { useActionState, useState } from "react";
import { postSlotAction, schedule, type ScheduleState } from "@/app/shifts/actions";
import { TurfMap } from "@/components/TurfMap";
import type { JobLaunch } from "@/lib/job-launch";
import { AvailabilityStatement } from "@/components/AvailabilityStatement";
import type { Availability, OrgAvailabilityView } from "@/lib/availability";
import { slotFit } from "@/lib/shift-slots";

const initial: ScheduleState = { ok: false, message: "", errors: {} };
/** datetime-local value (organizer's own zone) → ISO; the server never guesses a zone. */
const toIso = (v: string) => (v ? new Date(v).toISOString() : "");
/** The chosen time in words: on a narrow phone with large text the field cuts off the date's start. */
const readback = (v: string) =>
  v && <span className="text-hint block">{new Date(v).toLocaleString([], { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>;

export function ScheduleShiftForm({
  jobId,
  workers,
  supervisors,
  launch,
  variant = "shift",
}: {
  jobId: string;
  /** Hired workers, with their availability only where they share it with this organization. */
  workers: Array<{ engagementId: string; name: string; availability?: Availability | null; view?: OrgAvailabilityView }>;
  supervisors: Array<{ id: string; label: string }>;
  /** How the job's days start (C4.2): its staging points to pick from, or self-launch. */
  launch: JobLaunch;
  /** "slot" posts an open shift with seats for hired workers to take (M8.2) instead of scheduling one worker. */
  variant?: "shift" | "slot";
}) {
  const slot = variant === "slot";
  const [state, action, pending] = useActionState(slot ? postSlotAction : schedule, initial);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [engagementId, setEngagementId] = useState("");
  const chosen = workers.find((w) => w.engagementId === engagementId) ?? null;
  // In the scheduler's own time zone: the worker set their hours as local wall-clock times.
  const span = start && end && new Date(end) > new Date(start) ? { startsAt: new Date(start), endsAt: new Date(end) } : null;
  const fitOf = (w: (typeof workers)[number]) => (span && w.availability ? slotFit(span, w.availability, Intl.DateTimeFormat().resolvedOptions().timeZone) : null);
  const fit = chosen ? fitOf(chosen) : null;
  // Once times are picked, each option says whether they fall in that worker's usual hours. The order never changes: it's a note, not a ranking.
  const optionNote = (w: (typeof workers)[number]) => {
    const f = fitOf(w);
    return f === "fits" ? " · in their usual hours" : f === "partly" || f === "outside" ? " · outside their usual hours" : "";
  };
  // Kept in state so a refused post doesn't clear them (React resets uncontrolled fields after an action).
  const [seats, setSeats] = useState("4");
  const [notes, setNotes] = useState("");
  // One of the job's points fills the staging fields; "elsewhere" leaves the map to place it.
  const [pointId, setPointId] = useState(launch.points[0]?.id ?? "");
  const point = launch.points.find((p) => p.id === pointId) ?? null;
  const self = launch.mode === "SELF";
  // Where the pin is now: moved off the chosen point, the shift loses that point's radius.
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const offPoint = !!point && !!pin && (Math.abs(pin.lat - point.lat) >= 1e-5 || Math.abs(pin.lng - point.lng) >= 1e-5);
  const err = (k: string) => (state.errors[k] ? <p className="field-error">{state.errors[k]}</p> : null);

  return (
    <form action={action} className="card space-y-4">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="startsAt" value={toIso(start)} />
      <input type="hidden" name="endsAt" value={toIso(end)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {slot ? (
          <>
            <label className="min-w-0 space-y-1.5">
              <span className="label">Seats</span>
              <input name="headcount" type="number" inputMode="numeric" min={1} max={200} step={1} className="field" required value={seats} onChange={(e) => setSeats(e.target.value)} />
              {err("headcount")}
            </label>
            <label className="min-w-0 space-y-1.5 sm:col-span-2">
              <span className="label">Notes for the crew <span className="text-hint">(optional)</span></span>
              <textarea name="notes" className="field" rows={2} maxLength={500} placeholder="Bring water; we'll pair up at the table." value={notes} onChange={(e) => setNotes(e.target.value)} />
              {err("notes")}
            </label>
          </>
        ) : (
          <label className="min-w-0 space-y-1.5 sm:col-span-2">
            <span className="label">Worker</span>
            <select name="engagementId" className="field" required value={engagementId} onChange={(e) => setEngagementId(e.target.value)}>
              <option value="" disabled>Choose a hired worker…</option>
              {workers.map((w) => <option key={w.engagementId} value={w.engagementId}>{w.name}{optionNote(w)}</option>)}
            </select>
            {!span && workers.some((w) => w.availability) && <span className="text-hint block">Once you pick the times below, each worker who shares their availability shows here whether it fits.</span>}
            {chosen && chosen.view !== undefined && (
              <span className="block space-y-1 pt-1">
                <span className="text-hint block">{chosen.name}&apos;s availability</span>
                <AvailabilityStatement view={chosen.view} />
              </span>
            )}
            {(fit === "outside" || fit === "partly") && (
              <span role="status" className="block text-sm font-semibold text-fg">
                {fit === "outside" ? "This is outside" : "This runs past"} the hours {chosen!.name} usually works. You can still schedule it; check with them first.
              </span>
            )}
          </label>
        )}
        <label className="min-w-0 space-y-1.5">
          <span className="label">Starts</span>
          <input type="datetime-local" className="field" required value={start} onChange={(e) => setStart(e.target.value)} />
          {readback(start)}
          {err("startsAt")}
        </label>
        <label className="min-w-0 space-y-1.5">
          <span className="label">Ends</span>
          <input type="datetime-local" className="field" required value={end} onChange={(e) => setEnd(e.target.value)} />
          {readback(end)}
          {err("endsAt")}
        </label>
        {self ? (
          <p className="text-muted-sm sm:col-span-2">Self-launch: the worker starts from wherever they are, and check-in records the time only.</p>
        ) : (
          <>
            {launch.points.length > 0 && (
              <label className="min-w-0 space-y-1.5">
                <span className="label">Staging point</span>
                <select className="field" value={pointId} onChange={(e) => setPointId(e.target.value)}>
                  {launch.points.map((p) => <option key={p.id} value={p.id}>{p.name} · check-in within {p.radiusM} m</option>)}
                  <option value="">Somewhere else (place it on the map)</option>
                </select>
              </label>
            )}
            <label className="min-w-0 space-y-1.5">
              <span className="label">Staging location</span>
              <input key={pointId} name="stagingLocation" className="field" maxLength={200} placeholder="Denver Central, table 3" defaultValue={point ? [point.name, point.address].filter(Boolean).join(", ") : ""} />
              {err("stagingLocation")}
            </label>
          </>
        )}
        <label className="min-w-0 space-y-1.5">
          <span className="label">Supervisor</span>
          <select name="supervisorId" className="field" defaultValue="">
            <option value="">None assigned</option>
            {supervisors.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {err("supervisorId")}
        </label>
      </div>
      <div className="space-y-1.5">
        <span className="label">{self ? "Turf" : "Turf and staging point"}</span>
        <TurfMap editable allowStaging={!self} staging={point ? { lat: point.lat, lng: point.lng } : null} onStagingChange={setPin} className="h-80" />
        {offPoint && (
          <p className="text-hint">The pin has moved off {point!.name}: check-in will use the usual 250 m radius, not this point&apos;s {point!.radiusM} m. Pick the point again to put it back.</p>
        )}
        {!self && launch.points.length > 0 && <p className="text-hint">Picking another staging point keeps the turf you drew; the staging location text is replaced.</p>}
        {err("turfArea")}
        {err("stagingLat")}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{slot ? (pending ? "Posting…" : "Post open shift") : pending ? "Scheduling…" : "Schedule shift"}</button>
        {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
      </div>
    </form>
  );
}
