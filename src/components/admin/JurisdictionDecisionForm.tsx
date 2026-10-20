"use client";

import { useActionState } from "react";
import { decideJurisdiction } from "@/app/admin/jurisdictions/actions";
import type { ActionState } from "@/app/jobs/actions";
import { REASON_MAX } from "@/lib/admin-reason";

const initial: ActionState = { ok: false, message: "" };

/** One decision on a version (M10.3): approve or renew (with an optional expiry), withdraw approval, or retire a proposal. Always with a reason. */
export function JurisdictionDecisionForm({ id, mode, label }: { id: string; mode: "approve" | "withdraw" | "retire"; label: string }) {
  const [state, action, pending] = useActionState(decideJurisdiction, initial);
  return (
    <form action={action} className="card space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={mode} />
      {mode === "approve" && (
        <label className="block space-y-1.5">
          <span className="label">Counsel approval expires (optional)</span>
          <input type="date" name="approvalExpiresAt" className="field" />
          <span className="text-hint block">Past that day the gate freezes every job under this version until it is renewed.</span>
        </label>
      )}
      <label className="block space-y-1.5">
        <span className="label">{mode === "approve" ? "Who approved it and how you know" : mode === "withdraw" ? "Why withdraw the approval" : "Why retire this proposal"}</span>
        <textarea name="reason" className="field min-h-20" required minLength={3} maxLength={REASON_MAX} />
        <span className="text-hint block">Recorded on the staff ledger with your name. Organizations are told what froze, never the reason.</span>
      </label>
      <button className={mode === "approve" ? "btn-primary" : "btn-secondary"} disabled={pending}>{pending ? "Saving…" : label}</button>
      {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
    </form>
  );
}
