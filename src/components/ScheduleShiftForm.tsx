"use client";

import { useActionState, useState } from "react";
import { schedule, type ScheduleState } from "@/app/shifts/actions";
import { TurfMap } from "@/components/TurfMap";

const initial: ScheduleState = { ok: false, message: "", errors: {} };
/** datetime-local value (organizer's own zone) → ISO; the server never guesses a zone. */
const toIso = (v: string) => (v ? new Date(v).toISOString() : "");

export function ScheduleShiftForm({
  jobId,
  workers,
  supervisors,
}: {
  jobId: string;
  workers: Array<{ engagementId: string; name: string }>;
  supervisors: Array<{ id: string; label: string }>;
}) {
  const [state, action, pending] = useActionState(schedule, initial);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
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
        <label className="space-y-1.5">
          <span className="label">Staging location</span>
          <input name="stagingLocation" className="field" maxLength={200} placeholder="Denver Central, table 3" />
          {err("stagingLocation")}
        </label>
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
        <span className="label">Turf and staging point</span>
        <TurfMap editable className="h-80" />
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
