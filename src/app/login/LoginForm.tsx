"use client";

import { useActionState } from "react";
import Link from "next/link";
import { logIn, type LoginState } from "./actions";

const initial: LoginState = { ok: false, message: "", email: "" };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(logIn, initial);
  return (
    <form action={action} method="post" className="card space-y-5 sm:p-8">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1.5 text-center">
        <h1 className="page-title">Welcome back</h1>
        <p className="text-muted-sm">Log in to Turfcut.</p>
      </div>
      <label className="block space-y-1.5">
        <span className="label">Email</span>
        <input className="field" type="email" name="email" autoComplete="email" inputMode="email" required defaultValue={state.email} />
      </label>
      <label className="block space-y-1.5">
        <span className="label">Password</span>
        <input className="field" type="password" name="password" autoComplete="current-password" />
      </label>
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-success-msg" : "text-danger-msg"}>
          {state.message}
        </p>
      )}
      <button type="submit" name="intent" value="password" disabled={pending} className="btn-primary w-full">
        {pending ? "Working…" : "Log in"}
      </button>
      <div className="flex items-center gap-3 text-xs font-semibold text-subtle">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <button type="submit" name="intent" value="link" formNoValidate disabled={pending} className="btn-secondary w-full">
        Email me a sign-in link
      </button>
      <p className="text-hint text-center">No password needed — the link signs you in on this device.</p>
      <p className="text-muted-sm text-center">
        New to Turfcut?{" "}
        <Link href="/signup" className="link">
          Create an account
        </Link>
      </p>
    </form>
  );
}
