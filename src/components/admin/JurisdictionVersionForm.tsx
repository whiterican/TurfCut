"use client";

import { useActionState } from "react";
import { proposeVersion } from "@/app/admin/jurisdictions/actions";
import type { ActionState } from "@/app/jobs/actions";
import { REASON_MAX } from "@/lib/admin-reason";
import { US_STATES } from "@/lib/experience";
import { COMPENSATION_METHODS } from "@/lib/jobs";
import { LOCALITY_MAX, NOTES_MAX, type JurisdictionRules } from "@/lib/jurisdiction-rules";

const initial: ActionState = { ok: false, message: "" };

/** Propose a version of a place's rules (M10.3): prefilled from the version it starts from, or blank for a new place. */
export function JurisdictionVersionForm({ defaults, fromLabel }: { defaults: { state: string; locality: string; rules: JurisdictionRules }; fromLabel: string | null }) {
  const [state, action, pending] = useActionState(proposeVersion, initial);
  const checks: Array<[keyof Pick<JurisdictionRules, "workerRegistrationRequired" | "badgeRequired" | "affidavitRequired">, string, string]> = [
    ["workerRegistrationRequired", "Circulator registration", "Petition jobs here require circulators to be registered."],
    ["badgeRequired", "Badge", "Circulators must wear a badge while collecting."],
    ["affidavitRequired", "Signed affidavit", "Each petition section needs the circulator's signed affidavit."],
  ];
  return (
    <form action={action} className="space-y-5">
      <div className="card space-y-4">
        <p className="eyebrow eyebrow-quiet">Place</p>
        {fromLabel && <p className="text-muted-sm">A new version of {fromLabel}. The place stays the same; edit the rules below.</p>}
        <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
          {fromLabel ? (
            <div className="block space-y-1.5">
              <span className="label">State</span>
              <input type="hidden" name="state" value={defaults.state} />
              <span className="field block">{defaults.state}</span>
            </div>
          ) : (
            <label className="block space-y-1.5">
              <span className="label">State</span>
              <select name="state" className="field" defaultValue={defaults.state} required>
                <option value="" disabled>Pick</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="label">Locality (blank for statewide)</span>
            <input name="locality" className="field" defaultValue={defaults.locality} maxLength={LOCALITY_MAX} readOnly={!!fromLabel} placeholder="Denver" />
          </label>
        </div>
      </div>

      <div className="card space-y-4">
        <p className="eyebrow eyebrow-quiet">Pay methods jobs may use</p>
        <div className="space-y-2">
          {COMPENSATION_METHODS.map((m) => (
            <label key={m.value} className="flex items-start gap-3">
              <input type="checkbox" name="methods" value={m.value} defaultChecked={defaults.rules.compensationAllowed.includes(m.value)} className="mt-1" />
              <span>
                <span className="block text-sm font-semibold text-fg">{m.label}</span>
                {m.value === "PER_UNIT" && <span className="block text-xs text-muted">Ticking this records counsel&apos;s explicit per-unit approval, which the publish gate requires for any per-unit job.</span>}
                {m.value === "HOURLY" && <span className="block text-xs text-muted">Always allowed by the gate; listed so the record says so.</span>}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="card space-y-4">
        <p className="eyebrow eyebrow-quiet">Circulator requirements (petition jobs)</p>
        <div className="space-y-2">
          {checks.map(([name, label, hint]) => (
            <label key={name} className="flex items-start gap-3">
              <input type="checkbox" name={name} defaultChecked={defaults.rules[name]} className="mt-1" />
              <span>
                <span className="block text-sm font-semibold text-fg">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="card space-y-4">
        <label className="block space-y-1.5">
          <span className="label">Notes for staff and counsel</span>
          <textarea name="notes" className="field min-h-24" maxLength={NOTES_MAX} defaultValue={defaults.rules.notes} placeholder="Statute references, what changed from the last version, what counsel asked for." />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Effective from (optional)</span>
          <input type="date" name="effectiveFrom" className="field" />
          <span className="text-hint block">Blank means effective as soon as it is approved. A later date keeps jobs frozen under it until then.</span>
        </label>
        <label className="block space-y-1.5">
          <span className="label">Why this version</span>
          <textarea name="reason" className="field min-h-20" required minLength={3} maxLength={REASON_MAX} placeholder="What changed in the law or in counsel's advice." />
          <span className="text-hint block">Recorded on the staff ledger with your name.</span>
        </label>
      </div>

      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Propose this version"}</button>
      {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
    </form>
  );
}
