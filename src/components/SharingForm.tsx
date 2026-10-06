"use client";

import { useActionState, useState } from "react";
import { saveSharingChoices, type SharingFormState } from "@/app/profile/sharing/actions";
import {
  AUDIENCE_OPTIONS,
  MAX_TRAVEL_MILES,
  PART_DETAILS,
  SHARE_PARTS,
  type ShareAudience,
  type SharePart,
  type SharingChoices,
  type WorkType,
} from "@/lib/sharing";

const initial: SharingFormState = { ok: false, message: "", errors: {} };
const WORK_TYPES: Array<{ value: WorkType; label: string }> = [
  { value: "PETITION", label: "Petition" },
  { value: "CANVASS", label: "Canvass" },
];

/**
 * Profile → Who sees what. Every part of the profile gets one of three
 * audiences; findability is separate and off by default. Fields are
 * controlled, so a refused save keeps what the worker chose (React resets
 * uncontrolled fields after a form action).
 */
export function SharingForm({ choices }: { choices: SharingChoices }) {
  const [state, action, pending] = useActionState(saveSharingChoices, initial);
  const [audiences, setAudiences] = useState<Record<SharePart, ShareAudience>>(choices.audiences);
  const [findable, setFindable] = useState(choices.findable);
  const [workTypes, setWorkTypes] = useState<WorkType[]>(choices.workTypes);
  const [homeArea, setHomeArea] = useState(choices.homeArea ?? "");
  const [travelMiles, setTravelMiles] = useState(choices.travelMiles?.toString() ?? "");
  const e = state.ok ? {} : state.errors;
  const errId = (k: string) => (e[k] ? `err-${k}` : undefined);
  const err = (k: string) => e[k] && <p id={`err-${k}`} className="text-danger-msg">{e[k]}</p>;
  const failed = Object.keys(e);

  return (
    <form action={action} className="space-y-6" noValidate>
      {failed.length > 0 && (
        <p role="alert" className="alert-warning">
          Nothing was saved. Check {failed.map((k) => (k in PART_DETAILS ? PART_DETAILS[k as SharePart].label : k === "workTypes" ? "work types" : k === "homeArea" ? "city or ZIP" : k === "travelMiles" ? "travel distance" : "your choices")).join(", ")}.
        </p>
      )}
      {SHARE_PARTS.map((part) => (
        <fieldset key={part} className={`card space-y-3 ${e[part] ? "border-[var(--danger)]" : ""}`} aria-describedby={errId(part)}>
          <legend className="float-left w-full space-y-0.5">
            <span className="block font-semibold text-fg">{PART_DETAILS[part].label}</span>
            <span className="text-muted-sm block font-normal">{PART_DETAILS[part].covers}</span>
          </legend>
          <div className="clear-both space-y-2 pt-1">
            {AUDIENCE_OPTIONS.map((o) => (
              <label key={o.value} className="option-card items-center py-3 text-sm text-fg">
                <input
                  type="radio"
                  name={`audience.${part}`}
                  value={o.value}
                  checked={audiences[part] === o.value}
                  onChange={() => setAudiences((a) => ({ ...a, [part]: o.value }))}
                  aria-invalid={e[part] ? true : undefined}
                />
                {o.label}
              </label>
            ))}
          </div>
          {err(part)}
        </fieldset>
      ))}
      <p className="text-hint">
        Today an organization only sees your profile after you apply or accept its invite, so both of the first two
        choices work the same for now. When Turfcut lets organizations look for workers, we&apos;ll ask you to confirm
        your choices first.
      </p>

      <fieldset className="card space-y-4">
        <legend className="sr-only">Findability</legend>
        <label className="toggle">
          {/* `switch` is Safari's native switch, which gives the light tick on iPhone. */}
          <input
            type="checkbox"
            role="switch"
            switch=""
            name="findable"
            checked={findable}
            onChange={(ev) => setFindable(ev.target.checked)}
            aria-describedby="findable-help"
          />
          Let organizations find me
        </label>
        <p id="findable-help" className="text-muted-sm">
          Off by default. When it&apos;s on, approved organizations can find you for the work you pick, near the place you
          type. Turfcut never uses your phone&apos;s location for this. Turning it off clears the place and distance.
        </p>
        {/* Disabled while off: nothing hidden is submitted or checked. */}
        <fieldset disabled={!findable} className={findable ? "space-y-4" : "hidden"}>
          <legend className="sr-only">Where and what</legend>
          <fieldset className="space-y-1.5" aria-describedby={errId("workTypes")}>
            <legend className="label">Work I want to be found for</legend>
            <div className="flex flex-wrap gap-2">
              {WORK_TYPES.map((t) => (
                <label key={t.value} className="chip">
                  <input
                    type="checkbox"
                    name="workTypes"
                    value={t.value}
                    checked={workTypes.includes(t.value)}
                    onChange={(ev) => setWorkTypes((w) => (ev.target.checked ? [...w, t.value] : w.filter((x) => x !== t.value)))}
                    className="sr-only"
                  />
                  {t.label}
                </label>
              ))}
            </div>
            {err("workTypes")}
          </fieldset>
          <label className="block space-y-1.5">
            <span className="label">City or ZIP you&apos;d travel from</span>
            <input
              name="homeArea"
              className="field max-w-80"
              maxLength={80}
              autoComplete="off"
              value={homeArea}
              onChange={(ev) => setHomeArea(ev.target.value)}
              placeholder="Denver, CO or 80202"
              aria-invalid={e.homeArea ? true : undefined}
              aria-describedby={errId("homeArea")}
            />
            {err("homeArea")}
          </label>
          <label className="block space-y-1.5">
            <span className="label">How far you&apos;d travel (miles, up to {MAX_TRAVEL_MILES})</span>
            <input
              name="travelMiles"
              inputMode="numeric"
              pattern="[0-9]*"
              className="field max-w-32"
              value={travelMiles}
              onChange={(ev) => setTravelMiles(ev.target.value)}
              aria-invalid={e.travelMiles ? true : undefined}
              aria-describedby={errId("travelMiles")}
            />
            {err("travelMiles")}
          </label>
        </fieldset>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
      </div>
    </form>
  );
}
