"use client";

import { useActionState } from "react";
import { savePhone, type ContactState } from "@/app/profile/actions";

const initial: ContactState = { ok: false, message: "" };
/** +13035550100 → (303) 555-0100; anything else is shown as stored, never hidden. */
const pretty = (v: string | null) => (v && /^\+1\d{10}$/.test(v) ? `(${v.slice(2, 5)}) ${v.slice(5, 8)}-${v.slice(8)}` : (v ?? ""));

export function PhoneForm({ phone }: { phone: string | null }) {
  const [state, action, pending] = useActionState(savePhone, initial);
  return (
    <form action={action} className="card space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1.5">
          <span className="label">Mobile number</span>
          <input name="phone" type="tel" inputMode="tel" autoComplete="tel" className="field max-w-60" defaultValue={pretty(phone)} placeholder="(303) 555-0100" />
        </label>
        <button className="btn-secondary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </div>
      <p className="text-hint">For shift reminders and day-of changes once text alerts launch. Never shown to organizations.</p>
      {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
    </form>
  );
}
