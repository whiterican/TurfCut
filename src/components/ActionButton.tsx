"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/jobs/actions";
import { ButtonFaces, PendingAnnouncement, useButtonPhase } from "@/components/ButtonFaces";

const initial: ActionState = { ok: false, message: "" };

/**
 * A one-button server action that shows its outcome in plain words. The
 * button morphs (P1.2): a spinner while it runs, a check when it lands.
 */
export function ActionButton({
  action,
  fields,
  label,
  pendingLabel,
  variant = "btn-primary",
  disabled = false,
  icon,
  children,
  confirm,
  ariaLabel,
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
  /**
   * For a step that can't be undone: the button first opens this warning
   * and a second button that confirms.
   */
  confirm?: { text: string; label: string };
  /** A fuller name for the button when the visible label repeats down a list. */
  ariaLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  // The initial state is not a result: only what the action returns is.
  const phase = useButtonPhase(pending, state === initial ? null : state);
  const working = pendingLabel ?? "Working…";
  // A disabled confirm step is just a disabled button: there's nothing to open.
  if (confirm && !disabled) {
    return (
      <details className="group">
        <summary className={`${variant} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          {icon}
          {label}
        </summary>
        <form action={formAction} className="mt-2 space-y-2 rounded-xl border border-border p-3">
          {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {children}
          <p className="text-sm text-fg">{confirm.text}</p>
          <PendingAnnouncement pending={pending} text={working} />
          <button className="btn-secondary btn-sm" disabled={disabled || pending} aria-busy={pending || undefined}>
            <ButtonFaces phase={phase} label={confirm.label} pendingLabel={working} />
          </button>
          {state.message && (
            <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>
          )}
        </form>
      </details>
    );
  }
  return (
    <form action={formAction} className="space-y-2">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="flex flex-wrap items-end gap-3">
        {children}
        {/* The fuller name only on the label face: while working or done, the visible words are the name. */}
        <button className={variant} disabled={disabled || pending} aria-label={phase === "idle" ? ariaLabel : undefined} aria-busy={pending || undefined}>
          <ButtonFaces phase={phase} icon={icon} label={label} pendingLabel={working} />
        </button>
        <PendingAnnouncement pending={pending} text={working} />
      </div>
      {state.message && (
        <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>
      )}
    </form>
  );
}
