"use client";

import { useActionState } from "react";
import type { KitFormState } from "@/app/campaigns/actions";
import { FACT_MAX, MAX_FACTS, SOURCE_URL_MAX } from "@/lib/campaign-kit";
import type { Fact } from "@/lib/campaign-kit-data";

const initial: KitFormState = { ok: false, message: "" };

/** One fact's form: edit an existing fact, or add a new one. */
function FactForm({ action, campaignId, postId, fact, submitLabel }: { action: (prev: KitFormState, fd: FormData) => Promise<KitFormState>; campaignId: string; postId: string; fact?: Fact; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const id = fact?.id ?? `new-${postId}`;
  const err = state.errors ?? {};
  return (
    <form action={formAction} className="space-y-2" key={fact ? `${fact.id}-${fact.updatedAt.toISOString()}` : "new"}>
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="postId" value={postId} />
      {fact && <input type="hidden" name="factId" value={fact.id} />}
      <div className="space-y-1">
        <label htmlFor={`fact-${id}`} className="label">{fact ? "Fact" : "New fact"}</label>
        <textarea id={`fact-${id}`} name="body" className="field min-h-16" maxLength={FACT_MAX * 2} defaultValue={fact?.body ?? ""} placeholder="One claim, in plain words. Up to 300 characters." aria-invalid={err.body ? true : undefined} aria-describedby={err.body ? `err-fact-${id}` : undefined} />
        {err.body && <p id={`err-fact-${id}`} className="field-error">{err.body}</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor={`src-${id}`} className="label">Source link (optional)</label>
        <input id={`src-${id}`} name="sourceUrl" type="url" className="field" maxLength={SOURCE_URL_MAX} defaultValue={fact?.sourceUrl ?? ""} placeholder="https://…" aria-invalid={err.sourceUrl ? true : undefined} aria-describedby={err.sourceUrl ? `err-src-${id}` : undefined} />
        {err.sourceUrl && <p id={`err-src-${id}`} className="field-error">{err.sourceUrl}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary btn-sm" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
        {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
      </div>
    </form>
  );
}

function RemoveFact({ action, campaignId, fact }: { action: (prev: KitFormState, fd: FormData) => Promise<KitFormState>; campaignId: string; fact: Fact }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="factId" value={fact.id} />
      <button className="btn-ghost btn-sm" disabled={pending}>{pending ? "Removing…" : "Remove"}</button>
      {state.message && !state.ok && <p role="status" className="text-danger-msg text-sm">{state.message}</p>}
    </form>
  );
}

/**
 * The campaign's own editor for a talking point's supporting facts (S4):
 * up to MAX_FACTS, each with an optional source link. Managers only.
 */
export function FactEditor({ save, remove, campaignId, postId, facts }: { save: (prev: KitFormState, fd: FormData) => Promise<KitFormState>; remove: (prev: KitFormState, fd: FormData) => Promise<KitFormState>; campaignId: string; postId: string; facts: Fact[] }) {
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
            <FactForm action={save} campaignId={campaignId} postId={postId} fact={f} submitLabel="Save fact" />
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
