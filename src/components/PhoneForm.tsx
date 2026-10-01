"use client";

import { useActionState } from "react";
import { savePhone, type ContactState } from "@/app/profile/actions";

const initial: ContactState = { ok: false, message: "" };
const pretty = (e164: string | null) => (e164 && e164.length === 12 ? `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}` : "");

export function PhoneForm({ phone }: { phone: string | null }) {
  const [state, action, pending] = useActionState(savePhone, initial);
  return (
    <form action={action} className="card space-y-3">
      <label className="block space-y-1.5">
        <span className="label">Mobile number</span>
        <div className="flex flex-wrap gap-3">
          <input name="phone" type="tel" inputMode="tel" autoComplete="tel" className="field max-w-60" defaultValue={pretty(phone)} placeholder="(303) 555-0100" />
          <button className="btn-secondary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </label>
      <p className="text-hint">For shift reminders and day-of changes once text alerts launch. Never shown to organizations.</p>
      {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
    </form>
  );
}
