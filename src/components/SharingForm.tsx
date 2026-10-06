"use client";

import { useActionState, useState } from "react";
import { saveSharingChoices, type SharingFormState } from "@/app/profile/sharing/actions";
import { AUDIENCE_OPTIONS, MAX_TRAVEL_MILES, PART_DETAILS, SHARE_PARTS, type SharingChoices, type WorkType } from "@/lib/sharing";

const initial: SharingFormState = { ok: false, message: "", errors: {} };
const WORK_TYPES: Array<{ value: WorkType; label: string }> = [
  { value: "PETITION", label: "Petition" },
  { value: "CANVASS", label: "Canvass" },
];

/** Profile → Who sees what. Every part of the profile gets one of three audiences; findability is separate and off by default. */
export function SharingForm({ choices }: { choices: SharingChoices }) {
  const [state, action, pending] = useActionState(saveSharingChoices, initial);
  const [findable, setFindable] = useState(choices.findable);
  const err = (k: string) => state.errors[k] && <p className="text-danger-msg">{state.errors[k]}</p>;

  return (
    <form action={action} className="space-y-6">
      {SHARE_PARTS.map((part) => (
        <fieldset key={part} className="card space-y-3">
          <legend className="sr-only">{PART_DETAILS[part].label}</legend>
          <div className="space-y-0.5">
            <p className="font-semibold text-fg">{PART_DETAILS[part].label}</p>
            <p className="text-muted-sm">{PART_DETAILS[part].covers}</p>
          </div>
          <div className="space-y-2">
            {AUDIENCE_OPTIONS.map((o) => (
              <label key={o.value} className="option-card items-center py-3 text-sm text-fg">
                <input type="radio" name={`audience.${part}`} value={o.value} defaultChecked={choices.audiences[part] === o.value} required />
                {o.label}
              </label>
            ))}
          </div>
          {err(part)}
        </fieldset>
      ))}
      <p className="text-hint">
        Until Matches arrives, an organization only reaches you after you apply or accept an invite, so
        &quot;any approved organization&quot; works the same as the first choice for now. Your choice is kept and
        takes effect then.
      </p>

      <fieldset className="card space-y-4">
        <legend className="sr-only">Let organizations find me</legend>
        <label className="toggle">
          <input type="checkbox" role="switch" name="findable" checked={findable} onChange={(e) => setFindable(e.target.checked)} />
          Let organizations find me
        </label>
        <p className="text-muted-sm">
          Off by default. When it&apos;s on, approved organizations can find you for the work you pick, near the place you type. Turfcut never uses your phone&apos;s location for this.
        </p>
        <div className={findable ? "space-y-4" : "hidden"}>
          <div className="space-y-1.5">
            <span className="label">Work I want to be found for</span>
            <div className="flex flex-wrap gap-2">
              {WORK_TYPES.map((t) => (
                <label key={t.value} className="chip">
                  <input type="checkbox" name="workTypes" value={t.value} defaultChecked={choices.workTypes.includes(t.value)} className="sr-only" />
                  {t.label}
                </label>
              ))}
            </div>
            {err("workTypes")}
          </div>
          <label className="block space-y-1.5">
            <span className="label">City or ZIP you&apos;d travel from</span>
            <input name="homeArea" className="field max-w-80" maxLength={80} autoComplete="off" defaultValue={choices.homeArea ?? ""} placeholder="Denver, CO or 80202" />
            {err("homeArea")}
          </label>
          <label className="block space-y-1.5">
            <span className="label">How far you&apos;d travel (miles)</span>
            <input name="travelMiles" type="number" inputMode="numeric" min={1} max={MAX_TRAVEL_MILES} step={1} className="field max-w-32" defaultValue={choices.travelMiles ?? ""} />
            {err("travelMiles")}
          </label>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
      </div>
    </form>
  );
}
