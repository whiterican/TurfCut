"use client";

import { useActionState } from "react";
import { addExperience, type ExperienceFormState } from "@/app/profile/actions";
import { CAMPAIGN_TYPES, CHANNELS, EXPERIENCE_GROUPS, TURF_TYPES, UNIT_TYPES, US_STATES } from "@/lib/experience";

const initial: ExperienceFormState = { ok: false, message: "", errors: {} };
const input = "field";
const optional = <span className="font-normal text-subtle">(optional)</span>;

/** Spec p.9 "Fields on every experience record": campaign, where, when, what, proof. */
export function ExperienceForm() {
  const [state, action, pending] = useActionState(addExperience, initial);
  const err = (k: string) =>
    state.errors[k] ? <p className="field-error">{state.errors[k]}</p> : null;

  return (
    <form action={action} className="space-y-8">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="fieldset-title">Campaign</legend>
        <label className="space-y-1 sm:col-span-2">
          <span className="label">Campaign or project</span>
          <input name="campaign" className={input} required maxLength={200} />
          {err("campaign")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Organization {optional}</span>
          <input name="organizationName" className={input} maxLength={200} placeholder="Who you worked for" />
          {err("organizationName")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Campaign type {optional}</span>
          <select name="campaignType" className={input} defaultValue="">
            <option value="">—</option>
            {CAMPAIGN_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {err("campaignType")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Kind of work</span>
          <select name="experienceGroup" className={input} defaultValue="" required>
            <option value="" disabled>Choose…</option>
            {EXPERIENCE_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
          {err("experienceGroup")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Role</span>
          <input name="role" className={input} required maxLength={100} placeholder="e.g. Circulator, Canvasser, Crew lead" />
          {err("role")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Channel {optional}</span>
          <select name="channel" className={input} defaultValue="">
            <option value="">—</option>
            {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {err("channel")}
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="fieldset-title">Where {optional}</legend>
        <label className="space-y-1.5">
          <span className="label">State</span>
          <select name="state" className={input} defaultValue="">
            <option value="">—</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {err("state")}
        </label>
        <label className="space-y-1.5">
          <span className="label">County or district</span>
          <input name="countyOrDistrict" className={input} maxLength={100} />
          {err("countyOrDistrict")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Turf</span>
          <select name="turfType" className={input} defaultValue="">
            <option value="">—</option>
            {TURF_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {err("turfType")}
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="fieldset-title">When</legend>
        <label className="space-y-1.5">
          <span className="label">Start date</span>
          <input name="startDate" type="date" className={input} required />
          {err("startDate")}
        </label>
        <label className="space-y-1.5">
          <span className="label">End date <span className="font-normal text-subtle">(blank if ongoing)</span></span>
          <input name="endDate" type="date" className={input} />
          {err("endDate")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Completed shifts {optional}</span>
          <input name="completedShifts" type="number" min={0} max={10000} step={1} className={input} />
          {err("completedShifts")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Active hours {optional}</span>
          <input name="activeHours" type="number" min={0} max={100000} step={0.25} className={input} />
          {err("activeHours")}
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="fieldset-title">What</legend>
        <label className="space-y-1.5">
          <span className="label">Submitted output</span>
          <input name="unitCount" type="number" min={0} max={1000000} step={1} className={input} required />
          {err("unitCount")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Unit</span>
          <select name="unitType" className={input} defaultValue="signatures">
            {UNIT_TYPES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          {err("unitType")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Approved output {optional}</span>
          <input name="approvedCount" type="number" min={0} max={1000000} step={1} className={input} />
          {err("approvedCount")}
        </label>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="fieldset-title">Proof {optional}</legend>
        <label className="block space-y-1">
          <span className="label">Reference who can confirm this work</span>
          <input name="referenceContact" className={input} maxLength={200} placeholder="Name, role, and email or phone" />
          {err("referenceContact")}
        </label>
        <p className="text-hint">
          Used only to verify this record. Organizations see &quot;reference provided&quot;, never the contact itself.
        </p>
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
          {pending ? "Adding…" : "Add experience"}
        </button>
        <p aria-live="polite" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>
      </div>
      <p className="text-hint">
        Records you add are marked self-reported: they show on your profile but
        don&apos;t count toward verified totals until Turfcut or an organization
        verifies them.
      </p>
    </form>
  );
}
