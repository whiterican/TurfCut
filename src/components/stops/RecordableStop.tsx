"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { recordOutcomeAction, type OutcomeState } from "@/app/walkbooks/actions";
import { fieldsFor, OUTCOMES, type FieldSpec, type OutcomeKind } from "@/lib/stop-outcomes";
import type { JobType } from "@/lib/jobs";
import { DirectionsLink, StopFace, stopColor, type StopView } from "@/components/stops/StopLine";
import { OutcomeGlyph } from "@/components/stops/Outcomes";

const initial: OutcomeState = { ok: false, message: "", errors: {} };

/** A v4 id for the tap. randomUUID needs a secure context and Safari 15.4; getRandomValues works everywhere this app does. */
function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * One stop on the worker's own walkbook: tap it to record what happened. The
 * six outcomes are big coloured tiles (colour, glyph and word together); the
 * fields under them are the work type's own and appear only where that work
 * records them. The device makes an id when the panel opens, so a double tap
 * or a retried request saves once.
 */
export function RecordableStop({ stop, jobType }: { stop: StopView; jobType: JobType }) {
  const [state, action, pending] = useActionState(recordOutcomeAction, initial);
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [chosen, setChosen] = useState<OutcomeKind | null>(stop.result.outcome);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [count, setCount] = useState(0);
  const [seen, setSeen] = useState(state);
  // Only an answer from this opening of the panel is shown: reopening starts clean.
  const [showState, setShowState] = useState(false);
  const router = useRouter();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLFormElement>(null);
  if (seen !== state) {
    setSeen(state);
    setShowState(true);
    if (state.ok) setOpen(false);
    // A refused tap that isn't about a field gets a fresh id, so the retry isn't refused the same way.
    else if (!state.gone && Object.keys(state.errors).length === 0) setClientId(newId());
  }
  // Keyboard and screen-reader users: into the panel when it opens, back to the stop when it closes.
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLInputElement>("input[type=radio]:checked, input[type=radio]")?.focus();
  }, [open]);
  useEffect(() => {
    if (state.ok) toggleRef.current?.focus();
  }, [state]);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => toggleRef.current?.focus());
  };
  const toggle = () => {
    if (!open) {
      setShowState(false);
      setClientId(newId());
      setChosen(stop.result.outcome);
      setFlags({ talked_to: stop.result.answers.talked_to === true, left_literature: stop.result.answers.left_literature === true });
      setCount(typeof stop.result.answers.signatures === "number" ? stop.result.answers.signatures : 0);
    }
    if (open) close();
    else setOpen(true);
  };
  const fields: FieldSpec[] = chosen ? fieldsFor(jobType, chosen) : [];
  const err = (k: string) => (showState && state.errors[k] ? <p className="field-error">{state.errors[k]}</p> : null);
  const panelId = `rec-${stop.id}`;

  return (
    <li className="relative">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: stopColor(stop) }} />
      <span role="status" className="sr-only">{showState && state.ok ? `Stop ${stop.stopNumber} saved.` : ""}</span>
      <div className="flex min-h-16 items-center gap-1 py-2 pl-3 pr-2">
        <button ref={toggleRef} type="button" onClick={toggle} aria-expanded={open} aria-controls={panelId} className="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-inner)] py-0.5 text-left focus-visible:outline-2">
          <StopFace stop={stop} />
          <ChevronDown aria-hidden className={`size-5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <DirectionsLink stop={stop} />
      </div>
      {open && (
        <form ref={panelRef} id={panelId} action={action} className="space-y-4 border-t border-border bg-surface-2/50 px-3 pb-4 pt-3">
          <input type="hidden" name="stopId" value={stop.id} />
          <input type="hidden" name="clientId" value={clientId} />
          <fieldset className="space-y-2">
            <legend className="label">What happened at this door?</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {OUTCOMES.map((o) => {
                const on = chosen === o.kind;
                return (
                  <label
                    key={o.kind}
                    className="relative flex min-h-16 cursor-pointer items-center gap-2.5 rounded-[var(--radius-inner)] border-2 bg-surface p-2.5 pr-8 transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]"
                    style={{ borderColor: on ? o.color : "var(--border)", background: on ? `color-mix(in srgb, ${o.color} 16%, var(--surface))` : undefined, boxShadow: on ? `inset 0 0 0 1px ${o.color}` : undefined }}
                  >
                    <input type="radio" name="outcome" value={o.kind} checked={on} onChange={() => setChosen(o.kind)} className="sr-only" required />
                    <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: o.color, color: o.ink }}>
                      <OutcomeGlyph kind={o.kind} className="size-5" />
                    </span>
                    {/* Chosen is said by a mark, not only by colour. */}
                    {on && (
                      <span aria-hidden className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-fg text-surface">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-bold leading-tight text-fg">{o.label}</span>
                      <span className="block text-xs leading-tight text-muted">{o.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {err("outcome")}
          </fieldset>

          {fields.length > 0 && (
            <div className="space-y-2">
              {fields.map((f) =>
                f.kind === "bool" ? (
                  <label key={f.key} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-inner)] border border-border bg-surface px-3 text-fg">
                    <input type="checkbox" name={f.key} checked={!!flags[f.key]} onChange={(e) => setFlags({ ...flags, [f.key]: e.target.checked })} className="size-5" />
                    <span className="font-medium">{f.label}</span>
                  </label>
                ) : (
                  <div key={f.key} className="flex min-h-12 items-center justify-between gap-3 rounded-[var(--radius-inner)] border border-border bg-surface px-3">
                    <label htmlFor={`${panelId}-${f.key}`} className="font-medium text-fg">{f.label}</label>
                    <div className="flex items-center gap-1">
                      <button type="button" className="grid size-11 place-items-center rounded-full border border-border text-fg disabled:opacity-40" onClick={() => setCount(Math.max(0, count - 1))} disabled={count <= 0} aria-label="One fewer signature">
                        <Minus aria-hidden className="size-5" />
                      </button>
                      <input id={`${panelId}-${f.key}`} name={f.key} type="number" inputMode="numeric" min={0} max={f.max} value={count} onChange={(e) => setCount(Math.min(f.max ?? 50, Math.max(0, Number(e.target.value) || 0)))} className="field h-11 w-16 text-center text-lg font-bold" />
                      <button type="button" className="grid size-11 place-items-center rounded-full border border-border text-fg disabled:opacity-40" onClick={() => setCount(Math.min(f.max ?? 50, count + 1))} disabled={count >= (f.max ?? 50)} aria-label="One more signature">
                        <Plus aria-hidden className="size-5" />
                      </button>
                    </div>
                    {err(f.key)}
                  </div>
                )
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button className="btn-primary min-h-12 flex-1" disabled={pending || !chosen || !clientId} aria-busy={pending || undefined}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn-ghost min-h-12" onClick={close}>Cancel</button>
          </div>
          {showState && state.message && !state.ok && (
            <div role="alert" className="space-y-2">
              <p className="text-danger-msg">{state.message}</p>
              {state.gone && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => router.refresh()}>
                  Refresh
                </button>
              )}
            </div>
          )}
        </form>
      )}
    </li>
  );
}
