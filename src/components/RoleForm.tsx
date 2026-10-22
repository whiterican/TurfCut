"use client";

import { useActionState } from "react";
import { saveRole, type RoleFormState } from "@/app/org/settings/members/roles/actions";
import { AREAS, levelsFor, type Grants } from "@/lib/access";
import { AREA_LABELS, ROLE_DESCRIPTION_MAX, ROLE_NAME_MAX } from "@/lib/org-roles";

const initial: RoleFormState = { ok: false, message: "" };

/**
 * One custom role (M10.6): its name, what it is for, and, for each area of
 * the access map, none, read or full. The preset it started from only
 * fills the form in; what is saved is the ticks.
 */
export function RoleForm({ roleId, basedOn, defaults, submitLabel }: { roleId?: string; basedOn: string | null; defaults: { name: string; description: string; grants: Grants }; submitLabel: string }) {
  const [state, action, pending] = useActionState(saveRole, initial);
  const err = state.errors ?? {};
  return (
    <form action={action} className="space-y-4">
      {roleId && <input type="hidden" name="roleId" value={roleId} />}
      {basedOn && <input type="hidden" name="basedOn" value={basedOn} />}
      <label className="block space-y-1.5">
        <span className="label">Name</span>
        <input name="name" className="field" required maxLength={ROLE_NAME_MAX} defaultValue={defaults.name} aria-invalid={!!err.name} placeholder="Field lead" />
        {err.name && <span className="text-danger-msg block">{err.name}</span>}
      </label>
      <label className="block space-y-1.5">
        <span className="label">What it is for (optional)</span>
        <textarea name="description" className="field min-h-16" maxLength={ROLE_DESCRIPTION_MAX} defaultValue={defaults.description} />
        {err.description && <span className="text-danger-msg block">{err.description}</span>}
      </label>
      <fieldset className="space-y-2">
        <legend className="label">What it can do</legend>
        <ul className="list-card">
          {AREAS.map((area) => {
            const levels = levelsFor(area);
            const current = defaults.grants[area] ?? "none";
            return (
              <li key={area} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block text-sm font-semibold text-fg">{AREA_LABELS[area].label}</span>
                  <span className="block text-xs text-muted">{AREA_LABELS[area].help}</span>
                </span>
                <select name={`area:${area}`} className="field w-auto" defaultValue={current} aria-label={`${AREA_LABELS[area].label} access`}>
                  <option value="none">None</option>
                  {levels.includes("read") && <option value="read">Read</option>}
                  {levels.includes("full") && <option value="full">{levels.includes("read") ? "Full" : "Yes"}</option>}
                </select>
              </li>
            );
          })}
        </ul>
        {err.grants && <p className="text-danger-msg">{err.grants}</p>}
      </fieldset>
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
      {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
    </form>
  );
}
