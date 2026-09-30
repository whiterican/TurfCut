"use client";

import { useActionState } from "react";
import { addExperience, type ExperienceFormState } from "@/app/profile/actions";
import { UNIT_TYPES } from "@/lib/experience";

const initial: ExperienceFormState = { ok: false, message: "", errors: {} };
const input =
  "w-full rounded-lg border px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white";

export function ExperienceForm() {
  const [state, action, pending] = useActionState(addExperience, initial);
  const err = (k: string) =>
    state.errors[k] ? <p className="text-xs text-red-600">{state.errors[k]}</p> : null;

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 sm:col-span-2">
        <span className="text-sm font-medium">Campaign</span>
        <input name="campaign" className={input} required maxLength={200} />
        {err("campaign")}
      </label>
      <label className="space-y-1">
        <span className="text-sm font-medium">Role</span>
        <input name="role" className={input} required maxLength={100} placeholder="e.g. Circulator, Canvasser, Field lead" />
        {err("role")}
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Units</span>
          <input name="unitCount" type="number" min={0} max={1000000} step={1} className={input} required />
          {err("unitCount")}
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">of</span>
          <select name="unitType" className={input} defaultValue="signatures">
            {UNIT_TYPES.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          {err("unitType")}
        </label>
      </div>
      <label className="space-y-1">
        <span className="text-sm font-medium">Start date</span>
        <input name="startDate" type="date" className={input} required />
        {err("startDate")}
      </label>
      <label className="space-y-1">
        <span className="text-sm font-medium">End date <span className="font-normal text-neutral-500">(blank if ongoing)</span></span>
        <input name="endDate" type="date" className={input} />
        {err("endDate")}
      </label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black">
          {pending ? "Adding…" : "Add experience"}
        </button>
        <p aria-live="polite" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</p>
      </div>
      <p className="sm:col-span-2 text-xs text-neutral-500">
        Records you add are marked self-reported: they show on your profile but
        don&apos;t count toward verified totals until Turfcut or an organization
        verifies them.
      </p>
    </form>
  );
}
