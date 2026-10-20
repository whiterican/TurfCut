"use client";

import { useActionState } from "react";
import { decideOrg } from "@/app/admin/organizations/actions";
import type { ActionState } from "@/app/jobs/actions";
import { REASON_MAX } from "@/lib/admin-data";

const initial: ActionState = { ok: false, message: "" };

/** Turfcut's decision on an organization (M10.2): approve, or withdraw approval, always with a reason for the ledger. */
export function OrgDecisionForm({ orgId, approved }: { orgId: string; approved: boolean }) {
  const [state, action, pending] = useActionState(decideOrg, initial);
  const decision = approved ? "revoke" : "approve";
  return (
    <form action={action} className="card space-y-3">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="decision" value={decision} />
      <label className="block space-y-1.5">
        <span className="label">{approved ? "Why withdraw the approval" : "Why approve"}</span>
        <textarea name="reason" className="field min-h-20" required minLength={3} maxLength={REASON_MAX} placeholder={approved ? "What changed, and what the organization has to do to be restored." : "Who they are and what you checked."} />
        <span className="text-hint block">Recorded on the staff ledger with your name. The owners are told the decision, not the reason.</span>
      </label>
      <button className={approved ? "btn-secondary" : "btn-primary"} disabled={pending}>
        {pending ? "Saving…" : approved ? "Withdraw approval" : "Approve for the pilot"}
      </button>
      {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
    </form>
  );
}
