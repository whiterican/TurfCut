"use client";

import { useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { saveAvailabilityAction, type AvailabilityFormState } from "@/app/profile/availability/actions";
import {
  ALL_DAY,
  DAY_NAMES,
  DAYS,
  MAX_EXCEPTIONS,
  MAX_RANGES_PER_DAY,
  NOTE_MAX,
  type Availability,
  type DateException,
  type Day,
  type TimeRange,
} from "@/lib/availability";

const initial: AvailabilityFormState = { ok: false, message: "", errors: {} };
const DEFAULT_RANGE: TimeRange = { from: "09:00", to: "17:00" };
type ExceptionKind = "off" | "allDay" | "times";
const kindOf = (e: DateException): ExceptionKind =>
  e.ranges.length === 0 ? "off" : e.ranges.length === 1 && e.ranges[0].from === ALL_DAY.from && e.ranges[0].to === ALL_DAY.to ? "allDay" : "times";

/** "24:00" can't go in a time input; it shows as 23:59 and is saved back as 24:00. */
const toInput = (t: string) => (t === "24:00" ? "23:59" : t);
const fromInput = (t: string) => (t === "23:59" ? "24:00" : t);

function Ranges({ label, ranges, onChange }: { label: string; ranges: TimeRange[]; onChange: (r: TimeRange[]) => void }) {
  return (
    <div className="space-y-2">
      {ranges.map((r, i) => (
        <div key={i} className="space-y-1">
          <div className="grid max-w-md grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <input type="time" aria-label={`${label}: from`} className="field w-full min-w-0" value={toInput(r.from)} onChange={(e) => onChange(ranges.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} />
            <span aria-hidden className="text-muted">to</span>
            <input type="time" aria-label={`${label}: to`} className="field w-full min-w-0" value={toInput(r.to)} onChange={(e) => onChange(ranges.map((x, j) => (j === i ? { ...x, to: fromInput(e.target.value) } : x)))} />
          </div>
          {ranges.length > 1 && (
            <button type="button" className="link text-sm" onClick={() => onChange(ranges.filter((_, j) => j !== i))}>Remove this time</button>
          )}
        </div>
      ))}
      {ranges.length < MAX_RANGES_PER_DAY && (
        <button type="button" className="link text-sm" onClick={() => onChange([...ranges, { from: "18:00", to: "21:00" }])}>
          Add a second time
        </button>
      )}
    </div>
  );
}

/**
 * Profile → Availability. Controlled, submitted from onSubmit (no form
 * reset). Sent as one JSON payload; the server checks every part.
 */
export function AvailabilityForm({ availability }: { availability: Availability }) {
  const [weekly, setWeekly] = useState<Partial<Record<Day, TimeRange[]>>>(availability.weekly);
  const [exceptions, setExceptions] = useState<DateException[]>(availability.exceptions);
  const [note, setNote] = useState(availability.note ?? "");
  const [state, setState] = useState<AvailabilityFormState>(initial);
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const e = state.ok ? {} : state.errors;
  const err = (k: string) => e[k] && <p id={`err-${k}`} className="text-danger-msg">{e[k]}</p>;

  const setDay = (d: Day, r: TimeRange[]) => setWeekly((w) => ({ ...w, [d]: r }));
  const setException = (i: number, x: DateException) => setExceptions((xs) => xs.map((y, j) => (j === i ? x : y)));

  const onSubmit = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    const payload = JSON.stringify({ weekly, exceptions, note });
    start(async () => {
      try {
        setState(await saveAvailabilityAction(payload));
      } catch (err) {
        unstable_rethrow(err);
        setState({ ok: false, message: "Couldn't reach Turfcut, so this may not have saved. Your week is still here; try again.", errors: {} });
      } finally {
        inFlight.current = false;
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {Object.keys(e).length > 0 && <p role="alert" className="alert-warning">Nothing was saved. Check the parts marked below.</p>}

      <fieldset className="card space-y-1" aria-describedby={e.weekly ? "err-weekly" : undefined}>
        <legend className="float-left w-full pb-2 font-semibold text-fg">Your usual week</legend>
        <ul className="clear-both divide-y divide-border">
          {DAYS.map((d) => {
            const on = (weekly[d]?.length ?? 0) > 0;
            return (
              <li key={d} className="space-y-2 py-3">
                <label className="toggle">
                  <input type="checkbox" role="switch" switch="" checked={on} onChange={(ev) => setDay(d, ev.target.checked ? [DEFAULT_RANGE] : [])} />
                  {DAY_NAMES[d]}
                </label>
                {on && <Ranges label={DAY_NAMES[d]} ranges={weekly[d]!} onChange={(r) => setDay(d, r)} />}
                {err(d)}
              </li>
            );
          })}
        </ul>
        {err("weekly")}
      </fieldset>

      <fieldset className="card space-y-3" aria-describedby={e.exceptions ? "err-exceptions" : undefined}>
        <legend className="float-left w-full font-semibold text-fg">Dates that are different</legend>
        <p className="text-muted-sm clear-both">A day you can&apos;t work, or one you&apos;re free that you usually aren&apos;t.</p>
        <ul className="space-y-3">
          {exceptions.map((x, i) => (
            <li key={i} className="space-y-2 rounded-xl border border-border p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_auto_1fr] sm:items-center">
                <input type="date" aria-label="Date" className="field w-full sm:w-44" value={x.date} onChange={(ev) => setException(i, { ...x, date: ev.target.value })} />
                <select
                  aria-label="That day"
                  className="field w-full sm:w-auto"
                  value={kindOf(x)}
                  onChange={(ev) => {
                    const k = ev.target.value as ExceptionKind;
                    setException(i, { ...x, ranges: k === "off" ? [] : k === "allDay" ? [ALL_DAY] : [DEFAULT_RANGE] });
                  }}
                >
                  <option value="off">Not available</option>
                  <option value="allDay">Free all day</option>
                  <option value="times">Free at these times</option>
                </select>
                <button type="button" className="link justify-self-start text-sm" onClick={() => setExceptions((xs) => xs.filter((_, j) => j !== i))}>Remove this date</button>
              </div>
              {kindOf(x) === "times" && <Ranges label={x.date || "That day"} ranges={x.ranges} onChange={(r) => setException(i, { ...x, ranges: r })} />}
            </li>
          ))}
        </ul>
        {exceptions.length < MAX_EXCEPTIONS && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setExceptions((xs) => [...xs, { date: "", ranges: [] }])}>
            Add a date
          </button>
        )}
        {err("exceptions")}
      </fieldset>

      <label className="card block space-y-1.5">
        <span className="font-semibold text-fg">A note for schedulers</span>
        <textarea
          className="field min-h-24"
          maxLength={NOTE_MAX}
          value={note}
          onChange={(ev) => setNote(ev.target.value)}
          placeholder="e.g. I can't drive after dark."
          aria-invalid={e.note ? true : undefined}
          aria-describedby={e.note ? "err-note" : undefined}
        />
        {err("note")}
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
      </div>
    </form>
  );
}
