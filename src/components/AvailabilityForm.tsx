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
/** The kind is the worker's choice, kept in state, so typing times never flips it. */
type Row = { date: string; kind: ExceptionKind; ranges: TimeRange[] };

const kindOf = (e: DateException): ExceptionKind =>
  e.ranges.length === 0 ? "off" : e.ranges.length === 1 && e.ranges[0].from === ALL_DAY.from && e.ranges[0].to === ALL_DAY.to ? "allDay" : "times";
const toPayload = (r: Row): DateException => ({ date: r.date, ranges: r.kind === "off" ? [] : r.kind === "allDay" ? [ALL_DAY] : r.ranges });

/** "24:00" can't go in a time input; it shows as 23:59 and is saved back as 24:00 ("until midnight"). */
const toInput = (t: string) => (t === "24:00" ? "23:59" : t);
const fromInput = (t: string) => (t === "23:59" ? "24:00" : t);

function Ranges({ label, ranges, onChange, errorId }: { label: string; ranges: TimeRange[]; onChange: (r: TimeRange[]) => void; errorId?: string }) {
  return (
    <div className="space-y-2">
      {ranges.map((r, i) => (
        <div key={i} className="space-y-1">
          <div className="grid max-w-md grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <input type="time" aria-label={`${label}: from`} aria-describedby={errorId} aria-invalid={errorId ? true : undefined} className="field w-full min-w-0" value={toInput(r.from)} onChange={(e) => onChange(ranges.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} />
            <span aria-hidden className="text-muted">to</span>
            <input type="time" aria-label={`${label}: to`} aria-describedby={errorId} aria-invalid={errorId ? true : undefined} className="field w-full min-w-0" value={toInput(r.to)} onChange={(e) => onChange(ranges.map((x, j) => (j === i ? { ...x, to: fromInput(e.target.value) } : x)))} />
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
  const [rows, setRows] = useState<Row[]>(availability.exceptions.map((e) => ({ date: e.date, kind: kindOf(e), ranges: kindOf(e) === "times" ? e.ranges : [DEFAULT_RANGE] })));
  const [note, setNote] = useState(availability.note ?? "");
  const [state, setState] = useState<AvailabilityFormState>(initial);
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const e = state.ok ? {} : state.errors;
  const errId = (k: string) => (e[k] ? `err-${k.replace(".", "-")}` : undefined);
  const err = (k: string) => e[k] && <p id={errId(k)} className="text-danger-msg">{e[k]}</p>;
  // An edit clears that part's error: switching a day off shouldn't leave its message behind.
  const clear = (k: string) => setState((s) => (s.errors[k] ? { ...s, errors: Object.fromEntries(Object.entries(s.errors).filter(([x]) => x !== k)) } : s));

  // Removing a date renumbers the rest, so their messages no longer line up: drop them all.
  const clearDates = () => setState((s) => ({ ...s, errors: Object.fromEntries(Object.entries(s.errors).filter(([x]) => !x.startsWith("exceptions."))) }));
  const setDay = (d: Day, r: TimeRange[]) => {
    setWeekly((w) => ({ ...w, [d]: r }));
    clear(d);
  };
  const setRow = (i: number, x: Row) => {
    setRows((xs) => xs.map((y, j) => (j === i ? x : y)));
    clear(`exceptions.${i}`);
  };

  const onSubmit = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    const payload = JSON.stringify({ weekly, exceptions: rows.map(toPayload), note });
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

      <fieldset className="card space-y-1" aria-describedby={errId("weekly")}>
        <legend className="float-left w-full font-semibold text-fg">Your usual week</legend>
        <p className="text-muted-sm clear-both pb-1">
          In your own local time. Working past midnight? Add the late part to the next day too.
        </p>
        <ul className="divide-y divide-border">
          {DAYS.map((d) => {
            const on = (weekly[d]?.length ?? 0) > 0;
            return (
              <li key={d} className="space-y-2 py-3">
                <label className="toggle">
                  <input type="checkbox" role="switch" switch="" checked={on} onChange={(ev) => setDay(d, ev.target.checked ? [DEFAULT_RANGE] : [])} />
                  {DAY_NAMES[d]}
                </label>
                {on && <Ranges label={DAY_NAMES[d]} ranges={weekly[d]!} onChange={(r) => setDay(d, r)} errorId={errId(d)} />}
                {err(d)}
              </li>
            );
          })}
        </ul>
        {err("weekly")}
      </fieldset>

      <fieldset className="card space-y-3" aria-describedby={errId("exceptions")}>
        <legend className="float-left w-full font-semibold text-fg">Dates that are different</legend>
        <p className="text-muted-sm clear-both">A day you can&apos;t work, or one you&apos;re free that you usually aren&apos;t. Dates drop off once they&apos;re past.</p>
        <ul className="space-y-3">
          {rows.map((x, i) => {
            const n = `Date ${i + 1}`;
            const id = errId(`exceptions.${i}`);
            return (
              <li key={i} className="space-y-2 rounded-xl border border-border p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_auto_1fr] sm:items-center">
                  <input type="date" aria-label={n} aria-describedby={id} aria-invalid={id ? true : undefined} className="field w-full sm:w-44" value={x.date} onChange={(ev) => setRow(i, { ...x, date: ev.target.value })} />
                  <select aria-label={`${n}: that day`} className="field w-full sm:w-auto" value={x.kind} onChange={(ev) => setRow(i, { ...x, kind: ev.target.value as ExceptionKind })}>
                    <option value="off">Not available</option>
                    <option value="allDay">Free all day</option>
                    <option value="times">Free at these times</option>
                  </select>
                  <button type="button" className="link justify-self-start text-sm" onClick={() => { setRows((xs) => xs.filter((_, j) => j !== i)); clearDates(); }}>Remove this date</button>
                </div>
                {x.kind === "times" && <Ranges label={n} ranges={x.ranges} onChange={(r) => setRow(i, { ...x, ranges: r })} errorId={id} />}
                {err(`exceptions.${i}`)}
              </li>
            );
          })}
        </ul>
        {rows.length < MAX_EXCEPTIONS && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setRows((xs) => [...xs, { date: "", kind: "off", ranges: [DEFAULT_RANGE] }])}>
            Add a date
          </button>
        )}
        {err("exceptions")}
      </fieldset>

      <label className="card block space-y-1.5">
        <span className="font-semibold text-fg">A note for schedulers</span>
        <span className="text-muted-sm block">Organizations that can see your availability read this. Keep it about scheduling.</span>
        <textarea
          className="field min-h-24"
          maxLength={NOTE_MAX}
          value={note}
          onChange={(ev) => { setNote(ev.target.value); clear("note"); }}
          placeholder="e.g. Can't start before 10am on school days."
          aria-invalid={e.note ? true : undefined}
          aria-describedby={errId("note")}
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
