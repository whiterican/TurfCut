"use client";

import { useActionState, useState } from "react";
import { schedule, type ScheduleState } from "@/app/shifts/actions";
import { TurfMap } from "@/components/TurfMap";
import type { JobLaunch } from "@/lib/job-launch";

const initial: ScheduleState = { ok: false, message: "", errors: {} };
/** datetime-local value (organizer's own zone) → ISO; the server never guesses a zone. */
const toIso = (v: string) => (v ? new Date(v).toISOString() : "");

export function ScheduleShiftForm({
  jobId,
  workers,
  supervisors,
  launch,
}: {
  jobId: string;
  workers: Array<{ engagementId: string; name: string }>;
  supervisors: Array<{ id: string; label: string }>;
  /** How the job's days start (C4.2): its staging points to pick from, or self-launch. */
  launch: JobLaunch;
}) {
  const [state, action, pending] = useActionState(schedule, initial);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  // One of the job's points fills the staging fields; "elsewhere" leaves the map to place it.
  const [pointId, setPointId] = useState(launch.points[0]?.id ?? "");
  const point = launch.points.find((p) => p.id === pointId) ?? null;
  const self = launch.mode === "SELF";
  const err = (k: string) => (state.errors[k] ? <p className="field-error">{state.errors[k]}</p> : null);

  return (
    <form action={action} className="card space-y-4">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="startsAt" value={toIso(start)} />
      <input type="hidden" name="endsAt" value={toIso(end)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 sm:col-span-2">
          <span className="label">Worker</span>
          <select name="engagementId" className="field" required defaultValue="">
            <option value="" disabled>Choose a hired worker…</option>
            {workers.map((w) => <option key={w.engagementId} value={w.engagementId}>{w.name}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="label">Starts</span>
          <input type="datetime-local" className="field" required value={start} onChange={(e) => setStart(e.target.value)} />
          {err("startsAt")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Ends</span>
          <input type="datetime-local" className="field" required value={end} onChange={(e) => setEnd(e.target.value)} />
          {err("endsAt")}
        </label>
        {self ? (
          <p className="text-muted-sm sm:col-span-2">Self-launch: the worker starts from wherever they are, and check-in records the time only.</p>
        ) : (
          <>
            {launch.points.length > 0 && (
              <label className="space-y-1.5">
                <span className="label">Staging point</span>
                <select className="field" value={pointId} onChange={(e) => setPointId(e.target.value)}>
                  {launch.points.map((p) => <option key={p.id} value={p.id}>{p.name} · check-in within {p.radiusM} m</option>)}
                  <option value="">Somewhere else (place it on the map)</option>
                </select>
              </label>
            )}
            <label className="space-y-1.5">
              <span className="label">Staging location</span>
              <input key={pointId} name="stagingLocation" className="field" maxLength={200} placeholder="Denver Central, table 3" defaultValue={point ? [point.name, point.address].filter(Boolean).join(", ") : ""} />
              {err("stagingLocation")}
            </label>
          </>
        )}
        <label className="space-y-1.5">
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
        {/* Keyed by the chosen point, so picking another one moves the pin. */}
        <TurfMap key={pointId} editable allowStaging={!self} staging={point ? { lat: point.lat, lng: point.lng } : null} className="h-80" />
        {err("turfArea")}
        {err("stagingLat")}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Scheduling…" : "Schedule shift"}</button>
        {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
      </div>
    </form>
  );
}
