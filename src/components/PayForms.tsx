"use client";

import { useActionState, useRef } from "react";
import type { ActionState } from "@/app/jobs/actions";

const initial: ActionState = { ok: false, message: "" };

function Status({ state }: { state: ActionState }) {
  return state.message ? <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p> : null;
}

export interface ApprovalRow {
  id: string;
  worker: string;
  detail: string;
  amount: string;
  flag: string | null;
  /** Why this person can't approve the line (two-person rule), or null. */
  blocked: string | null;
}

/** Lines awaiting payment approval, approved together. */
export function ApproveLines({ action, rows }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; rows: ApprovalRow[] }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const form = useRef<HTMLFormElement>(null);
  const setAll = (on: boolean) => form.current?.querySelectorAll<HTMLInputElement>('input[name="payoutIds"]:not(:disabled)').forEach((i) => (i.checked = on));
  return (
    <form ref={form} action={formAction} className="space-y-3">
      <ul className="list-card">
        {rows.map((r) => (
          <li key={r.id}>
            <label className={`flex items-start gap-3 px-4 py-3 ${r.blocked ? "" : "cursor-pointer"}`}>
              <input type="checkbox" name="payoutIds" value={r.id} disabled={!!r.blocked} className="mt-1 size-4 accent-[var(--focus)]" />
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block text-sm font-semibold text-fg">{r.worker}</span>
                <span className="block text-xs text-muted">{r.detail}</span>
                {r.flag && <span className="block text-xs font-semibold text-danger-msg">{r.flag}</span>}
                {r.blocked && <span className="block text-xs text-subtle">{r.blocked}</span>}
              </span>
              <span className="shrink-0 font-bold text-fg">{r.amount}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Approving…" : "Approve selected"}</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setAll(true)}>Select all</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setAll(false)}>Clear</button>
      </div>
      <Status state={state} />
    </form>
  );
}

/** Put one line on hold, with a reason the worker sees. */
export function HoldLine({ action, payoutId }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; payoutId: string }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <details className="group">
      <summary className="link cursor-pointer list-none text-xs font-semibold">
        <span className="group-open:hidden">Hold</span>
        <span className="hidden group-open:inline">Cancel</span>
      </summary>
      <form action={formAction} className="space-y-2 pt-2">
        <input type="hidden" name="payoutId" value={payoutId} />
        <label className="block space-y-1.5">
          <span className="label">Reason (the worker sees it)</span>
          <input name="reason" className="field" required maxLength={300} />
        </label>
        <button className="btn-secondary btn-sm" disabled={pending}>{pending ? "Holding…" : "Put on hold"}</button>
        <Status state={state} />
      </form>
    </details>
  );
}

/** Close a dispute: keep, adjust, or confirm a re-review. */
export function ResolveDispute({ action, disputeId, reReviewed }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; disputeId: string; reReviewed: boolean }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="disputeId" value={disputeId} />
      <fieldset className="space-y-2">
        <legend className="label">Outcome</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="outcome" value="KEPT" required className="accent-[var(--focus)]" /> Keep the pay as it is
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="outcome" value="ADJUSTED" className="accent-[var(--focus)]" /> Adjust the pay by
          <input name="amount" className="field w-28" inputMode="decimal" placeholder="25.00" aria-label="Adjustment in dollars (negative to deduct)" />
        </label>
        <label className={`flex items-center gap-2 text-sm ${reReviewed ? "" : "text-subtle"}`}>
          <input type="radio" name="outcome" value="REREVIEWED" disabled={!reReviewed} className="accent-[var(--focus)]" /> The shift was re-reviewed
          {!reReviewed && <span className="text-xs">(a supervisor re-reviews it on the shift page first)</span>}
        </label>
      </fieldset>
      <label className="block space-y-1.5">
        <span className="label">Response to the worker</span>
        <textarea name="response" className="field min-h-16" required maxLength={1000} />
      </label>
      <button className="btn-primary btn-sm" disabled={pending}>{pending ? "Closing…" : "Close dispute"}</button>
      <Status state={state} />
    </form>
  );
}
