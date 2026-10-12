"use client";

import { useActionState } from "react";
import type { KitFormState } from "@/app/campaigns/actions";
import { AUDIENCE_LABELS, KIND_LABELS, MAX_RESOURCES, RESOURCE_AUDIENCES, RESOURCE_KINDS, RESOURCE_MAX, TITLE_MAX } from "@/lib/campaign-kit";
import type { Resource } from "@/lib/campaign-kit-data";

const initial: KitFormState = { ok: false, message: "" };
type Action = (prev: KitFormState, fd: FormData) => Promise<KitFormState>;

function ResourceForm({ action, campaignId, resource, submitLabel }: { action: Action; campaignId: string; resource?: Resource; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const id = resource?.id ?? `new-${campaignId}`;
  const err = state.errors ?? {};
  return (
    <form action={formAction} className="space-y-3" key={resource ? `${resource.id}-${resource.updatedAt.toISOString()}` : "new"}>
      <input type="hidden" name="campaignId" value={campaignId} />
      {resource && <input type="hidden" name="resourceId" value={resource.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`kind-${id}`} className="label">What is it?</label>
          <select id={`kind-${id}`} name="kind" className="field" defaultValue={resource?.kind ?? "SCRIPT"}>
            {RESOURCE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k].one}</option>)}
          </select>
          {err.kind && <p className="field-error">{err.kind}</p>}
        </div>
        <div className="space-y-1">
          <label htmlFor={`aud-${id}`} className="label">Who sees it?</label>
          <select id={`aud-${id}`} name="audience" className="field" defaultValue={resource?.audience ?? "WORKERS"}>
            {RESOURCE_AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_LABELS[a].label}</option>)}
          </select>
          {err.audience && <p className="field-error">{err.audience}</p>}
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor={`title-${id}`} className="label">Title</label>
        <input id={`title-${id}`} name="title" className="field" maxLength={TITLE_MAX} defaultValue={resource?.title ?? ""} placeholder="Door script, “Is this a tax?”, Saturday logistics…" aria-invalid={err.title ? true : undefined} />
        {err.title && <p className="field-error">{err.title}</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor={`body-${id}`} className="label">Text</label>
        <textarea id={`body-${id}`} name="body" className="field min-h-40" maxLength={RESOURCE_MAX * 2} defaultValue={resource?.body ?? ""} placeholder="In your own words. Web links become links; everything else shows exactly as typed." aria-invalid={err.body ? true : undefined} />
        {err.body && <p className="field-error">{err.body}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary btn-sm" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
        {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
      </div>
    </form>
  );
}

function RemoveResource({ action, campaignId, resource }: { action: Action; campaignId: string; resource: Resource }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="resourceId" value={resource.id} />
      <button className="btn-ghost btn-sm" disabled={pending}>{pending ? "Removing…" : "Remove"}</button>
      {state.message && !state.ok && <p role="status" className="text-danger-msg text-sm">{state.message}</p>}
    </form>
  );
}

/** The campaign's own editor for its scripts, common questions and guides (S4). Managers only. */
export function ResourceEditor({ save, remove, campaignId, resources }: { save: Action; remove: Action; campaignId: string; resources: Resource[] }) {
  return (
    <div className="space-y-4">
      {resources.map((r) => (
        <details key={r.id} className="card group">
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
