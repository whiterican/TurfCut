"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { KitFormState } from "@/app/campaigns/actions";
import { charCount, FACT_MAX, MAX_FACTS, SOURCE_URL_MAX } from "@/lib/campaign-kit";
import type { Fact } from "@/lib/campaign-kit-data";

const initial: KitFormState = { ok: false, message: "" };
type Action = (prev: KitFormState, fd: FormData) => Promise<KitFormState>;

/**
 * One fact's form: edit an existing fact, or add a new one. The fields are
 * controlled, so a refused save keeps what was typed (a form action would
 * otherwise reset the form); a new fact's form clears once it's added.
 */
function FactForm({ action, campaignId, postId, fact, submitLabel }: { action: Action; campaignId: string; postId: string; fact?: Fact; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [body, setBody] = useState(fact?.body ?? "");
  const [sourceUrl, setSourceUrl] = useState(fact?.sourceUrl ?? "");
  const id = fact?.id ?? `new-${postId}`;
  const answered = useRef(state);
  useEffect(() => {
    if (state !== answered.current && state.ok && !fact) {
      startTransition(() => {
        setBody("");
        setSourceUrl("");
      });
    }
    answered.current = state;
  }, [state, fact]);
  const err = state.errors ?? {};
  const n = charCount(body.trim());
  return (
    <form
      noValidate
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="postId" value={postId} />
      {fact && <input type="hidden" name="factId" value={fact.id} />}
      <div className="space-y-1">
        <label htmlFor={`fact-${id}`} className="label">{fact ? "Fact" : "New fact"}</label>
        <textarea id={`fact-${id}`} name="body" className="field min-h-16" value={body} onChange={(e) => setBody(e.target.value)} placeholder="One claim, in plain words." aria-invalid={err.body || n > FACT_MAX ? true : undefined} aria-describedby={`count-fact-${id}${err.body ? ` err-fact-${id}` : ""}`} />
        <p id={`count-fact-${id}`} className={`text-hint text-right tabular-nums ${n > FACT_MAX ? "text-danger-msg" : ""}`}>{n} / {FACT_MAX} characters</p>
        {err.body && <p id={`err-fact-${id}`} className="field-error">{err.body}</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor={`src-${id}`} className="label">Source link (optional)</label>
        <input id={`src-${id}`} name="sourceUrl" type="url" className="field" maxLength={SOURCE_URL_MAX} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" aria-invalid={err.sourceUrl ? true : undefined} aria-describedby={err.sourceUrl ? `err-src-${id}` : undefined} />
        {err.sourceUrl && <p id={`err-src-${id}`} className="field-error">{err.sourceUrl}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary btn-sm" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
        {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
      </div>
    </form>
  );
}

/** Removing takes two taps: the first asks, the second does it. The row stays on the record. */
function RemoveFact({ action, campaignId, fact }: { action: Action; campaignId: string; fact: Fact }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [armed, setArmed] = useState(false);
  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="factId" value={fact.id} />
      {armed ? (
        <>
          <button className="btn-secondary btn-sm" disabled={pending}>{pending ? "Removing…" : "Yes, remove this fact"}</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setArmed(false)}>Keep it</button>
        </>
      ) : (
        <button type="button" className="btn-ghost btn-sm" onClick={() => setArmed(true)}>Remove</button>
      )}
      {state.message && !state.ok && <p role="status" className="text-danger-msg text-sm">{state.message}</p>}
    </form>
  );
}

/**
 * The campaign's own editor for a talking point's supporting facts (S4):
 * up to MAX_FACTS, each with an optional source link. Managers only.
 */
export function FactEditor({ save, remove, campaignId, postId, facts }: { save: Action; remove: Action; campaignId: string; postId: string; facts: Fact[] }) {
  return (
    <details className="group w-full">
      <summary className="link cursor-pointer list-none text-sm font-semibold">
        <span className="group-open:hidden">Supporting facts ({facts.length} of {MAX_FACTS})</span>
        <span className="hidden group-open:inline">Close supporting facts</span>
      </summary>
      <div className="space-y-4 pt-3">
        <p className="text-muted-sm">Three to five short facts that back this talking point, each with a source where you have one. Workers see them with the talking point, on your page and in their shift brief.</p>
        {facts.map((f, i) => (
          <div key={f.id} className="card-flat space-y-2">
            <p className="text-xs font-semibold text-muted">Fact {i + 1}</p>
            <FactForm key={f.updatedAt.toISOString()} action={save} campaignId={campaignId} postId={postId} fact={f} submitLabel="Save fact" />
            <RemoveFact action={remove} campaignId={campaignId} fact={f} />
          </div>
        ))}
        {facts.length < MAX_FACTS ? (
          <div className="card-flat">
            <FactForm action={save} campaignId={campaignId} postId={postId} submitLabel="Add fact" />
          </div>
        ) : (
          <p className="text-hint">That&apos;s the limit of {MAX_FACTS}. Remove one to add another.</p>
        )}
      </div>
    </details>
  );
}
