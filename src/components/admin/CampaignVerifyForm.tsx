"use client";

import { useActionState } from "react";
import { decideVerification } from "@/app/admin/campaigns/actions";
import type { ActionState } from "@/app/jobs/actions";
import { REASON_MAX } from "@/lib/admin-reason";

const initial: ActionState = { ok: false, message: "" };

/**
 * Verify a campaign profile, or take the mark off (M10.5). The form carries
 * the name and handle the staff member is looking at, so a rename in
 * between voids the decision instead of verifying something nobody checked.
 */
export function CampaignVerifyForm({ id, verified, name, handle }: { id: string; verified: boolean; name: string; handle: string }) {
  const [state, action, pending] = useActionState(decideVerification, initial);
  return (
    <form action={action} className="card space-y-3">
      <input type="hidden" name="campaignId" value={id} />
      <input type="hidden" name="decision" value={verified ? "unverify" : "verify"} />
      <input type="hidden" name="seenName" value={name} />
      <input type="hidden" name="seenHandle" value={handle} />
      <label className="block space-y-1.5">
        <span className="label">{verified ? "Why take the mark off" : "Why verify"}</span>
        <textarea name="reason" className="field min-h-20" required minLength={3} maxLength={REASON_MAX} placeholder={verified ? "What changed." : "How you confirmed this is the organization's official account."} />
        <span className="text-hint block">Recorded on the staff ledger with your name. The organization is not sent the reason.</span>
      </label>
      <button className={verified ? "btn-secondary" : "btn-primary"} disabled={pending}>
        {pending ? "Saving…" : verified ? "Remove the Verified mark" : "Verify this profile"}
      </button>
      {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
    </form>
  );
}
