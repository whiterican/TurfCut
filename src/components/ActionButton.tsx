"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/jobs/actions";

const initial: ActionState = { ok: false, message: "" };

/** A one-button server action that shows its outcome in plain words. */
export function ActionButton({
  action,
  fields,
  label,
  pendingLabel,
  variant = "btn-primary",
  disabled = false,
  icon,
  children,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: string;
  disabled?: boolean;
  /** A glyph shown before the label (decorative: the label carries the meaning). */
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="space-y-2">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="flex flex-wrap items-end gap-3">
        {children}
        <button className={variant} disabled={disabled || pending}>
          {icon}
          {pending ? (pendingLabel ?? "Working…") : label}
        </button>
      </div>
      {state.message && (
        <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>
      )}
    </form>
  );
}
