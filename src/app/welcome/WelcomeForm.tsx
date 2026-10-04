"use client";

import { useActionState, useState } from "react";
import { finishSetup, type SetupState } from "./actions";

const initial: SetupState = { message: "", errors: {} };

export function WelcomeForm({ invited }: { invited: boolean }) {
  const [state, action, pending] = useActionState(finishSetup, initial);
  const [type, setType] = useState("worker");
  const err = (k: string) => (state.errors[k] ? <p className="field-error">{state.errors[k]}</p> : null);
  return (
    <form action={action} className="card space-y-5 sm:p-8">
      <div className="space-y-2 text-center">
        <h1 className="page-title">Finish setting up</h1>
        <p className="text-muted-sm">
          {invited
            ? "Or set up your own account instead."
            : "The invite that brought you here is no longer open. You can still use Turfcut on your own, or ask the organization to invite you again."}
        </p>
      </div>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">Account type</legend>
        {[["worker", "I'm a worker"], ["company", "I'm hiring"]].map(([v, label]) => (
          <label key={v} className="option-card justify-center py-3 text-sm font-semibold text-fg">
            <input type="radio" name="accountType" value={v} checked={type === v} onChange={() => setType(v)} className="sr-only" />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="block space-y-1.5">
        <span className="label">{type === "worker" ? "Your name" : "Organization name"}</span>
        <input className="field" name="name" required maxLength={100} autoComplete={type === "worker" ? "name" : "organization"} />
        {err("name")}
      </label>
      {type === "worker" && (
        <label className="block space-y-1.5">
          <span className="label">Mobile number <span className="font-normal text-subtle">(optional)</span></span>
          <input className="field" type="tel" name="phone" inputMode="tel" autoComplete="tel" placeholder="(303) 555-0100" />
          {err("phone")}
        </label>
      )}
      {state.message && <p role="status" className="text-danger-msg">{state.message}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Setting up…" : "Continue"}</button>
    </form>
  );
}
