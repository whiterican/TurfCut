"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { KitFormState } from "@/app/campaigns/actions";
import { AUDIENCE_LABELS, charCount, KIND_LABELS, MAX_RESOURCES, RESOURCE_AUDIENCES, RESOURCE_KINDS, RESOURCE_MAX, TITLE_MAX, type ResourceAudience, type ResourceKind } from "@/lib/campaign-kit";
import type { Resource } from "@/lib/campaign-kit-data";

const initial: KitFormState = { ok: false, message: "" };
type Action = (prev: KitFormState, fd: FormData) => Promise<KitFormState>;

/**
 * One resource's form: edit an existing one, or add a new one. Controlled
 * fields, so a refused save keeps what was typed (an 8,000-character script
 * is not lost to a missing title); a new item's form clears once it's added.
 */
function ResourceForm({ action, campaignId, resource, submitLabel }: { action: Action; campaignId: string; resource?: Resource; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [kind, setKind] = useState<ResourceKind>(resource?.kind ?? "SCRIPT");
  const [audience, setAudience] = useState<ResourceAudience>(resource?.audience ?? "WORKERS");
  const [title, setTitle] = useState(resource?.title ?? "");
  const [body, setBody] = useState(resource?.body ?? "");
  const id = resource?.id ?? `new-${campaignId}`;
  const answered = useRef(state);
  useEffect(() => {
    if (state !== answered.current && state.ok && !resource) {
      startTransition(() => {
        setTitle("");
        setBody("");
      });
    }
    answered.current = state;
  }, [state, resource]);
  const err = state.errors ?? {};
  const n = charCount(body.trim());
  const describe = (field: string, extra?: string) => [err[field] ? `err-${field}-${id}` : null, extra ?? null].filter(Boolean).join(" ") || undefined;
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      {resource && <input type="hidden" name="resourceId" value={resource.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`kind-${id}`} className="label">What is it?</label>
          <select id={`kind-${id}`} name="kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as ResourceKind)} aria-invalid={err.kind ? true : undefined} aria-describedby={describe("kind", `hint-kind-${id}`)}>
            {RESOURCE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k].one}</option>)}
          </select>
          <p id={`hint-kind-${id}`} className="text-hint">{KIND_LABELS[kind].hint}</p>
          {err.kind && <p id={`err-kind-${id}`} className="field-error">{err.kind}</p>}
        </div>
        <div className="space-y-1">
          <label htmlFor={`aud-${id}`} className="label">Who sees it?</label>
          <select id={`aud-${id}`} name="audience" className="field" value={audience} onChange={(e) => setAudience(e.target.value as ResourceAudience)} aria-invalid={err.audience ? true : undefined} aria-describedby={describe("audience", `hint-aud-${id}`)}>
            {RESOURCE_AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_LABELS[a].label}</option>)}
          </select>
          <p id={`hint-aud-${id}`} className="text-hint">{AUDIENCE_LABELS[audience].hint}</p>
          {err.audience && <p id={`err-audience-${id}`} className="field-error">{err.audience}</p>}
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor={`title-${id}`} className="label">Title</label>
        <input id={`title-${id}`} name="title" className="field" maxLength={TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Door script, “Is this a tax?”, Saturday logistics…" aria-invalid={err.title ? true : undefined} aria-describedby={describe("title")} />
        {err.title && <p id={`err-title-${id}`} className="field-error">{err.title}</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor={`body-${id}`} className="label">Text</label>
        <textarea id={`body-${id}`} name="body" className="field min-h-40" value={body} onChange={(e) => setBody(e.target.value)} placeholder="In your own words. Web links become links; everything else shows exactly as typed." aria-invalid={err.body || n > RESOURCE_MAX ? true : undefined} aria-describedby={describe("body", `count-body-${id}`)} />
        <p id={`count-body-${id}`} className={`text-hint text-right tabular-nums ${n > RESOURCE_MAX ? "text-danger-msg" : ""}`}>{n.toLocaleString("en-US")} / {RESOURCE_MAX.toLocaleString("en-US")} characters</p>
        {err.body && <p id={`err-body-${id}`} className="field-error">{err.body}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary btn-sm" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
        {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
      </div>
    </form>
  );
}

/** Removing takes two taps: the first asks, the second does it. The row stays on the record. */
function RemoveResource({ action, campaignId, resource }: { action: Action; campaignId: string; resource: Resource }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [armed, setArmed] = useState(false);
  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="resourceId" value={resource.id} />
      {armed ? (
        <>
          <button className="btn-secondary btn-sm" disabled={pending}>{pending ? "Removing…" : `Yes, remove “${resource.title}”`}</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setArmed(false)}>Keep it</button>
        </>
      ) : (
        <button type="button" className="btn-ghost btn-sm" onClick={() => setArmed(true)}>Remove</button>
      )}
      {state.message && !state.ok && <p role="status" className="text-danger-msg text-sm">{state.message}</p>}
    </form>
  );
}

/** The campaign's own editor for its scripts, common questions and guides (S4). Managers only. */
export function ResourceEditor({ save, remove, campaignId, resources }: { save: Action; remove: Action; campaignId: string; resources: Resource[] }) {
  return (
    <div className="space-y-4">
      {resources.map((r) => (
        <details key={`${r.id}-${r.updatedAt.toISOString()}`} className="card group">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 font-semibold text-fg">
            <span>{r.title}</span>
            <span className="text-xs font-normal text-muted">
              {KIND_LABELS[r.kind].one} · {r.audience === "PUBLIC" ? "anyone" : "workers only"} · <span className="group-open:hidden">Edit</span><span className="hidden group-open:inline">Close</span>
            </span>
          </summary>
          <div className="space-y-3 pt-3">
            <ResourceForm action={save} campaignId={campaignId} resource={r} submitLabel="Save" />
            <RemoveResource action={remove} campaignId={campaignId} resource={r} />
          </div>
        </details>
      ))}
      {resources.length < MAX_RESOURCES ? (
        <details className="card group">
          <summary className="cursor-pointer list-none font-semibold text-fg">
            <span className="group-open:hidden">+ Add a script, question or guide</span>
            <span className="hidden group-open:inline">New item</span>
          </summary>
          <div className="pt-3">
            <ResourceForm action={save} campaignId={campaignId} submitLabel="Add" />
          </div>
        </details>
      ) : (
        <p className="text-hint">That&apos;s the limit of {MAX_RESOURCES}. Remove one to add another.</p>
      )}
    </div>
  );
}
