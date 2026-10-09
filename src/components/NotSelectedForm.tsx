"use client";

import { useActionState } from "react";
import { notSelected, type ActionState } from "@/app/jobs/actions";
import { NOT_SELECTED_REASONS, NOTE_MAX } from "@/lib/engagements";

const initial: ActionState = { ok: false, message: "" };

/**
 * "Not selected" (C3): a structured reason the worker sees, plus an optional
 * note to them. There is no private note about a worker (decision Q5).
 */
export function NotSelectedForm({ jobId, engagementId, label = "Not selected" }: { jobId: string; engagementId: string; label?: string }) {
  const [state, action, pending] = useActionState(notSelected, initial);
  const id = `ns-${engagementId}`;
  return (
    <details className="group">
      <summary className="btn-ghost btn-sm cursor-pointer list-none">{label}</summary>
      <form action={action} className="mt-3 space-y-3 rounded-xl border border-border p-3">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="engagementId" value={engagementId} />
        <label className="block space-y-1.5">
          <span className="label">Reason the worker sees</span>
          <select name="reasonCode" className="field" required defaultValue="">
            <option value="" disabled>Pick one</option>
            {NOT_SELECTED_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="label">Note to the worker (optional)</span>
          <textarea id={`${id}-note`} name="note" className="field min-h-20" maxLength={NOTE_MAX} />
          <span className="text-hint block">They read this. Keep it about the job, never about who they are.</span>
        </label>
        <button className="btn-secondary btn-sm" disabled={pending}>{pending ? "Saving…" : "Confirm not selected"}</button>
        {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
      </form>
    </details>
  );
}
