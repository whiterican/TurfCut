"use client";

import { useActionState } from "react";
import { addExperience, type ExperienceFormState } from "@/app/profile/actions";
import { CAMPAIGN_TYPES, CHANNELS, EXPERIENCE_GROUPS, TURF_TYPES, UNIT_TYPES, US_STATES } from "@/lib/experience";

const initial: ExperienceFormState = { ok: false, message: "", errors: {} };
const input =
  "w-full rounded-lg border px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white";
const optional = <span className="font-normal text-neutral-500">(optional)</span>;

/** Spec p.9 "Fields on every experience record": campaign, where, when, what, proof. */
export function ExperienceForm() {
  const [state, action, pending] = useActionState(addExperience, initial);
  const err = (k: string) =>
    state.errors[k] ? <p className="text-xs text-red-600">{state.errors[k]}</p> : null;

  return (
    <form action={action} className="space-y-5">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold">Campaign</legend>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Campaign or project</span>
          <input name="campaign" className={input} required maxLength={200} />
          {err("campaign")}
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Organization {optional}</span>
          <input name="organizationName" className={input} maxLength={200} placeholder="Who you worked for" />
          {err("organizationName")}
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Campaign type {optional}</span>
          <select name="campaignType" className={input} defaultValue="">
            <option value="">—</option>
            {CAMPAIGN_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {err("campaignType")}
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Kind of work</span>
          <select name="experienceGroup" className={input} defaultValue="" required>
            <option value="" disabled>Choose…</option>
            {EXPERIENCE_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
          {err("experienceGroup")}
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Role</span>
          <input name="role" className={input} required maxLength={100} placeholder="e.g. Circulator, Canvasser, Crew lead" />
          {err("role")}
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Channel {optional}</span>
          <select name="channel" className={input} defaultValue="">
            <option value="">—</option>
            {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {err("channel")}
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-semibold">Where {optional}</legend>
        <label className="space-y-1">
          <span className="text-sm font-medium">State</span>
          <select name="state" className={input} defaultValue="">
            <option value="">—</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {err("state")}
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">County or district</span>
          <input name="countyOrDistrict" className={input} maxLength={100} />
          {err("countyOrDistrict")}
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Turf</span>
          <select name="turfType" className={input} defaultValue="">
            <option value="">—</option>
            {TURF_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {err("turfType")}
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold">When</legend>
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
        <label className="space-y-1">
          <span className="text-sm font-medium">Completed shifts {optional}</span>
          <input name="completedShifts" type="number" min={0} max={10000} step={1} className={input} />
          {err("completedShifts")}
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Active hours {optional}</span>
          <input name="activeHours" type="number" min={0} max={100000} step={0.25} className={input} />
          {err("activeHours")}
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-semibold">What</legend>
        <label className="space-y-1">
          <span className="text-sm font-medium">Submitted output</span>
          <input name="unitCount" type="number" min={0} max={1000000} step={1} className={input} required />
          {err("unitCount")}
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Unit</span>
          <select name="unitType" className={input} defaultValue="signatures">
            {UNIT_TYPES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          {err("unitType")}
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Approved output {optional}</span>
          <input name="approvedCount" type="number" min={0} max={1000000} step={1} className={input} />
          {err("approvedCount")}
        </label>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-semibold">Proof {optional}</legend>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Reference who can confirm this work</span>
          <input name="referenceContact" className={input} maxLength={200} placeholder="Name, role, and email or phone" />
          {err("referenceContact")}
        </label>
        <p className="text-xs text-neutral-500">
          Used only to verify this record. Organizations see &quot;reference provided&quot;, never the contact itself.
        </p>
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black">
          {pending ? "Adding…" : "Add experience"}
        </button>
        <p aria-live="polite" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</p>
      </div>
      <p className="text-xs text-neutral-500">
        Records you add are marked self-reported: they show on your profile but
        don&apos;t count toward verified totals until Turfcut or an organization
        verifies them.
      </p>
    </form>
  );
}
