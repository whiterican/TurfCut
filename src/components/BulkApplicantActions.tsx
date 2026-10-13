"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { bulkMove, type ActionState } from "@/app/jobs/actions";
import { NOT_SELECTED_REASONS, NOTE_MAX } from "@/lib/engagements";

const initial: ActionState = { ok: false, message: "" };

/**
 * Bulk steps for the applicants table (C3.2). The table's checkboxes belong
 * to this form by id. Not selected takes one reason, and an optional note,
 * that every selected worker reads.
 */
export function BulkApplicantActions({ formId, jobId }: { formId: string; jobId: string }) {
  const [state, action, pending] = useActionState(bulkMove, initial);
  const [step, setStep] = useState("review");
  // After a step that moved someone, clear the table's checks so the next step starts from nothing.
  useEffect(() => {
    if (!state.ok) return;
    document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][form="${formId}"]`).forEach((c) => (c.checked = false));
  }, [state, formId]);
  return (
    // Submitted by hand rather than through `action`: React resets an action form when it finishes,
    // which would clear the table's checkboxes (they belong to this form) even when nothing moved.
    <form
      id={formId}
      className="card space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1.5">
          <span className="label">For the selected applicants</span>
          <select name="bulk" className="field" value={step} onChange={(e) => setStep(e.target.value)}>
            <option value="review">Mark in review</option>
            <option value="offer">Send an offer</option>
            <option value="decline">Not selected</option>
          </select>
        </label>
        {step === "decline" && (
          <label className="space-y-1.5">
            <span className="label">Reason they see</span>
            <select name="reasonCode" className="field" required defaultValue="">
              <option value="" disabled>Pick one</option>
              {NOT_SELECTED_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
        )}
        <button className="btn-secondary" disabled={pending}>{pending ? "Working…" : "Update selected"}</button>
      </div>
      {(step === "decline" || step === "offer") && (
        <label className="block space-y-1.5">
          <span className="label">Note to each of them (optional)</span>
          <textarea name="note" className="field min-h-16" maxLength={NOTE_MAX} />
          <span className="text-hint block">Every selected worker reads the same note. Keep it about the job, never about who they are.</span>
        </label>
      )}
      {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
    </form>
  );
}
