"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signUp, type SignupState } from "./actions";

const initial: SignupState = { message: "", errors: {}, values: {} };

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, initial);
  const [type, setType] = useState(state.values.accountType === "company" ? "company" : "worker");
  const err = (k: string) => (state.errors[k] ? <p className="field-error">{state.errors[k]}</p> : null);
  const optional = <span className="font-normal text-subtle">(optional)</span>;

  if (state.values.done) {
    return (
      <div className="card space-y-3 text-center sm:p-8">
        <h1 className="page-title">Almost there</h1>
        <p role="status" className="text-success-msg">{state.message}</p>
        <Link href="/login" className="btn-primary w-full">Go to log in</Link>
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-5 sm:p-8">
      <div className="space-y-1.5 text-center">
        <h1 className="page-title">Join Turfcut</h1>
        <p className="text-muted-sm">Field workers and hiring organizations each get their own account.</p>
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
        <input className="field" name="name" required maxLength={100} autoComplete={type === "worker" ? "name" : "organization"} defaultValue={state.values.name} />
        {err("name")}
      </label>
      <label className="block space-y-1.5">
        <span className="label">Email</span>
        <input className="field" type="email" name="email" required inputMode="email" autoComplete="email" defaultValue={state.values.email} />
        {err("email")}
      </label>
      {type === "worker" && (
        <label className="block space-y-1.5">
          <span className="label">Mobile number {optional}</span>
          <input className="field" type="tel" name="phone" inputMode="tel" autoComplete="tel" placeholder="(303) 555-0100" defaultValue={state.values.phone} />
          <span className="text-hint block">For shift reminders and day-of changes once text alerts launch. Never shown to organizations.</span>
          {err("phone")}
        </label>
      )}
      <label className="block space-y-1.5">
        <span className="label">Password</span>
        <input className="field" type="password" name="password" required minLength={8} autoComplete="new-password" />
        <span className="text-hint block">At least 8 characters. You can also sign in later with an emailed link.</span>
        {err("password")}
      </label>
      {state.message && <p role="alert" className="text-danger-msg">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Creating account…" : "Create account"}
      </button>
      <p className="text-muted-sm text-center">
        Have an account?{" "}
        <Link href="/login" className="link">
          Log in
        </Link>
      </p>
    </form>
  );
}
