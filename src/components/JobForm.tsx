"use client";

import { useActionState } from "react";
import { saveJob, type JobFormState } from "@/app/jobs/actions";
import { AFFILIATIONS, affiliationLabel, COMPENSATION_METHODS, HIRING_MODES, JOB_TYPES } from "@/lib/jobs";
import { CAMPAIGN_TYPES, ISSUES } from "@/lib/political-fit";
import { US_STATES } from "@/lib/experience";

const initial: JobFormState = { message: "", errors: {} };
const optional = <span className="font-normal text-subtle">(optional)</span>;

export interface JurisdictionOption {
  id: string;
  label: string;
  problems: string[];
}

/**
 * The job builder. Saves a draft only — publishing is a separate step that
 * runs the jurisdiction hard stop. Campaign positions use the same issue
 * list workers answer with, so overlap is a direct comparison.
 */
export function JobForm({
  jobId,
  defaults = {},
  jurisdictions,
}: {
  jobId?: string;
  defaults?: Record<string, unknown>;
  jurisdictions: JurisdictionOption[];
}) {
  const [state, action, pending] = useActionState(saveJob, initial);
  const d = (k: string, fallback = "") => (typeof defaults[k] === "string" ? (defaults[k] as string) : fallback);
  const modes = Array.isArray(defaults.hiringModes) ? (defaults.hiringModes as string[]) : ["application"];
  const err = (k: string) => (state.errors[k] ? <p className="field-error">{state.errors[k]}</p> : null);

  return (
    <form action={action} className="space-y-8">
      {jobId && <input type="hidden" name="jobId" value={jobId} />}

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="fieldset-title">The work</legend>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="label">Title</span>
          <input name="title" className="field" required maxLength={120} defaultValue={d("title")} />
          {err("title")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Type</span>
          <select name="type" className="field" defaultValue={d("type", "PETITION")}>
            {JOB_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {err("type")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Jurisdiction rule profile</span>
          <select name="jurisdictionId" className="field" defaultValue={d("jurisdictionId")} required>
            <option value="" disabled>Choose…</option>
            {jurisdictions.map((j) => (
              <option key={j.id} value={j.id}>{j.label}{j.problems.length ? " — can't publish" : ""}</option>
            ))}
          </select>
          {err("jurisdictionId")}
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="label">Description {optional}</span>
          <textarea name="description" className="field min-h-24" maxLength={2000} defaultValue={d("description")} />
          {err("description")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Starts</span>
          <input type="date" name="startsAt" className="field" required defaultValue={d("startsAt")} />
          {err("startsAt")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Ends</span>
          <input type="date" name="endsAt" className="field" required defaultValue={d("endsAt")} />
          {err("endsAt")}
        </label>
        <label className="space-y-1.5">
          <span className="label">City</span>
          <input name="city" className="field" required maxLength={80} defaultValue={d("city")} />
          {err("city")}
        </label>
        <label className="space-y-1.5">
          <span className="label">State</span>
          <select name="state" className="field" defaultValue={d("state")} required>
            <option value="" disabled>—</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {err("state")}
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="fieldset-title">Pay and hiring</legend>
        <label className="space-y-1.5">
          <span className="label">Paid</span>
          <select name="compensationMethod" className="field" defaultValue={d("compensationMethod", "HOURLY")}>
            {COMPENSATION_METHODS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {err("compensationMethod")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Gross rate ($)</span>
          <input name="payRate" inputMode="decimal" className="field" required defaultValue={d("payRate")} placeholder="25.00" />
          {err("payRate")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Headcount</span>
          <input name="headcount" inputMode="numeric" className="field" required defaultValue={d("headcount")} />
          {err("headcount")}
        </label>
        <div className="space-y-1.5 sm:col-span-3">
          <span className="label">How you hire</span>
          <div className="flex flex-wrap gap-2">
            {HIRING_MODES.map((m) => (
              <label key={m.value} className="chip">
                <input type="checkbox" name="hiringModes" value={m.value} defaultChecked={modes.includes(m.value)} className="sr-only" />
                {m.label}
              </label>
            ))}
          </div>
          {err("hiringModes")}
        </div>
        <label className="space-y-1.5 sm:col-span-3">
          <span className="label">Cancellation notice (hours)</span>
          <input name="cancellationNoticeHours" inputMode="numeric" className="field sm:max-w-40" defaultValue={d("cancellationNoticeHours", "24")} />
          <p className="text-hint">A worker cancelling a shift with less notice than this counts as a no-show on their scorecard.</p>
          {err("cancellationNoticeHours")}
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="fieldset-title">Requirements</legend>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          {[
            ["registration", "Circulator registration"],
            ["badge", "Badge"],
            ["affidavit", "Signed affidavit"],
          ].map(([k, label]) => (
            <label key={k} className="chip">
              <input type="checkbox" name={k} defaultChecked={defaults[k] === "on"} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        <p className="text-hint sm:col-span-2">The jurisdiction&apos;s own requirements are added to the job card automatically.</p>
        <label className="space-y-1.5">
          <span className="label">Training {optional}</span>
          <input name="training" className="field" maxLength={120} defaultValue={d("training")} />
          {err("training")}
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="label">Script {optional}</span>
          <textarea name="script" className="field min-h-24" maxLength={4000} defaultValue={d("script")} />
          {err("script")}
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="fieldset-title">Campaign disclosure</legend>
        <p className="text-muted-sm sm:col-span-2">
          Workers see this before they apply. Issue positions you disclose are the only basis for &ldquo;issue overlap&rdquo; —
          and only with workers who chose to share theirs.
        </p>
        <label className="space-y-1.5">
          <span className="label">Campaign type</span>
          <select name="campaignType" className="field" defaultValue={d("campaignType")} required>
            <option value="" disabled>Choose…</option>
            {CAMPAIGN_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {err("campaignType")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Affiliation</span>
          <select name="affiliation" className="field" defaultValue={d("affiliation")} required>
            <option value="" disabled>Choose…</option>
            {AFFILIATIONS.map((a) => <option key={a} value={a}>{affiliationLabel(a)}</option>)}
          </select>
          {err("affiliation")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Candidate or measure name {optional}</span>
          <input name="campaignName" className="field" maxLength={120} defaultValue={d("campaignName")} />
          {err("campaignName")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Ballot measure IDs {optional}</span>
          <input name="measureIds" className="field" defaultValue={d("measureIds")} placeholder="I-305, I-12" />
          {err("measureIds")}
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="label">Campaign message</span>
          <textarea name="message" className="field min-h-20" required maxLength={500} defaultValue={d("message")} />
          {err("message")}
        </label>
        <div className="space-y-2 sm:col-span-2">
          <span className="label">Public issue positions {optional}</span>
          <div className="list-card">
            {ISSUES.map((i) => (
              <label key={i.key} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="text-fg">{i.label}</span>
                <select name={`issue_${i.key}`} className="field max-w-36" defaultValue={d(`issue_${i.key}`)}>
                  <option value="">Not disclosed</option>
                  <option value="support">Support</option>
                  <option value="oppose">Oppose</option>
                </select>
              </label>
            ))}
          </div>
          {err("issues")}
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="fieldset-title">Who handles problems</legend>
        <label className="space-y-1.5">
          <span className="label">Emergencies</span>
          <input name="contactEmergency" className="field" required maxLength={200} defaultValue={d("contactEmergency")} />
          {err("contactEmergency")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Pay disputes</span>
          <input name="contactDisputes" className="field" required maxLength={200} defaultValue={d("contactDisputes")} />
          {err("contactDisputes")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Lost materials</span>
          <input name="contactLostMaterials" className="field" required maxLength={200} defaultValue={d("contactLostMaterials")} />
          {err("contactLostMaterials")}
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : jobId ? "Save draft" : "Create draft"}</button>
        {state.message && <p role="status" className="text-danger-msg">{state.message}</p>}
      </div>
    </form>
  );
}
