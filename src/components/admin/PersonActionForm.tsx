"use client";

import { useActionState } from "react";
import { removeMemberAsStaff, resendInviteAsStaff } from "@/app/admin/people/actions";
import type { ActionState } from "@/app/jobs/actions";
import { REASON_MAX } from "@/lib/admin-reason";

const initial: ActionState = { ok: false, message: "" };

/** One support action on an account (M10.4), always with a reason for the ledger. */
export function PersonActionForm({ kind, fields, label, prompt }: { kind: "resend" | "remove"; fields: Record<string, string>; label: string; prompt: string }) {
  const [state, action, pending] = useActionState(kind === "resend" ? resendInviteAsStaff : removeMemberAsStaff, initial);
  return (
    <form action={action} className="space-y-3">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="block space-y-1.5">
        <span className="label">{prompt}</span>
        <textarea name="reason" className="field min-h-16" required minLength={3} maxLength={REASON_MAX} />
        <span className="text-hint block">Recorded on the staff ledger with your name; the organization&apos;s own trail says Turfcut staff did it, not who.</span>
      </label>
      <button className="btn-secondary btn-sm" disabled={pending}>{pending ? "Working…" : label}</button>
      {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
    </form>
  );
}
