"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { recordOutcomeAction, type OutcomeState } from "@/app/walkbooks/actions";
import { idForTap, newId, tapContents } from "@/lib/client-id";
import type { PollQuestionView } from "@/lib/poll";
import { WorkerPollForm } from "@/components/stops/WorkerPollForm";
import { fieldsFor, OUTCOMES, type FieldSpec, type OutcomeKind } from "@/lib/stop-outcomes";
import type { JobType } from "@/lib/jobs";
import { DirectionsLink, StopFace, stopColor, type StopView } from "@/components/stops/StopLine";
import { OutcomeGlyph } from "@/components/stops/Outcomes";

const initial: OutcomeState = { ok: false, message: "", errors: {} };

/**
 * One stop on the worker's own walkbook: tap it to record what happened. The
 * six outcomes are big coloured tiles (colour, glyph and word together); the
 * fields under them are the work type's own and appear only where that work
 * records them. The device makes an id when the panel opens, so a double tap
 * or a retried request saves once.
 */
export function RecordableStop({ stop, jobType, poll = [] }: { stop: StopView; jobType: JobType; poll?: PollQuestionView[] }) {
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
    // After saving a Done at a job with a poll, the panel stays open: the poll is next. A save is done with its
    // id: a fresh one, so a changed outcome saved from the open panel is a new entry, not "Already saved".
    if (state.ok) {
      setOpen(poll.length > 0 && chosen === "DONE");
      setClientId(newId());
    }
    // A refused tap that isn't about a field gets a fresh id, so the retry isn't refused the same way. A save
    // that may have landed (state.retry) keeps its id, so trying again counts it once.
    else if (!state.gone && !state.retry && Object.keys(state.errors).length === 0) setClientId(newId());
  }
  // Keyboard and screen-reader users: into the panel when it opens, back to the stop when it closes.
  useEffect(() => {
    // The chosen tile if there is one (a reopen keeps the last outcome), else the first.
    if (open) (panelRef.current?.querySelector<HTMLInputElement>("input[type=radio]:checked") ?? panelRef.current?.querySelector<HTMLInputElement>("input[type=radio]"))?.focus();
  }, [open]);
  useEffect(() => {
    if (state.ok) toggleRef.current?.focus();
  }, [state]);

  // What the last tap sent, with its id. An id kept after a save that may have landed (state.retry) is reused only
  // for a tap that sends the same: an outcome or count changed since is a new tap, never "Already saved" and dropped.
  const sent = useRef<{ id: string; contents: string } | null>(null);
  const submit = (fd: FormData) => {
    // Save stays focusable while it can't be used (aria-disabled), so a press then does nothing here.
    if (pending || !chosen || !clientId) return;
    const contents = tapContents(fd);
    const t = idForTap(sent.current?.id === clientId ? sent.current : null, contents);
    if (sent.current?.id === clientId && t.id !== clientId) {
      fd.set("clientId", t.id);
      setClientId(t.id);
    }
    sent.current = { id: String(fd.get("clientId") ?? ""), contents };
    return action(fd);
  };

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
          <StopFace stop={stop} extra={poll.length > 0 && stop.result.outcome === "DONE" && stop.pollMine ? `Poll ${poll.filter((q) => (stop.pollLocked ?? []).includes(q.id) || (stop.poll ?? []).some((a) => a.questionId === q.id)).length} of ${poll.length}` : null} />
          <ChevronDown aria-hidden className={`size-5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <DirectionsLink stop={stop} />
      </div>
      {open && (
        <>
        <form ref={panelRef} id={panelId} action={submit} onKeyDown={(e) => e.key === "Escape" && close()} className="space-y-4 border-t border-border bg-surface-2/50 px-3 pb-4 pt-3">
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
                      <button type="button" className="grid size-11 place-items-center rounded-full border border-border text-fg aria-disabled:opacity-40" onClick={() => count > 0 && setCount(count - 1)} aria-disabled={count <= 0} aria-label="One fewer signature">
                        <Minus aria-hidden className="size-5" />
                      </button>
                      <input id={`${panelId}-${f.key}`} name={f.key} type="number" inputMode="numeric" min={0} max={f.max} value={count} onChange={(e) => setCount(Math.min(f.max ?? 50, Math.max(0, Number(e.target.value) || 0)))} className="field h-11 w-16 text-center text-lg font-bold" />
                      <button type="button" className="grid size-11 place-items-center rounded-full border border-border text-fg aria-disabled:opacity-40" onClick={() => count < (f.max ?? 50) && setCount(count + 1)} aria-disabled={count >= (f.max ?? 50)} aria-label="One more signature">
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
            {/* aria-disabled, not disabled: a focused button that turns disabled drops focus to the page (submit ignores it). */}
            <button className="btn-primary min-h-12 flex-1 aria-disabled:cursor-not-allowed aria-disabled:opacity-50" aria-disabled={pending || !chosen || !clientId} aria-busy={pending || undefined}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn-ghost min-h-12" onClick={close}>Cancel</button>
          </div>
          {showState && state.message && !state.ok && (
            <div role="alert" className="space-y-2">
              <p className="text-danger-msg">{state.message}</p>
              {state.gone && (
                <button type="button" className="btn-secondary" onClick={() => router.refresh()}>
                  Refresh
                </button>
              )}
            </div>
          )}
        </form>
        {/* The poll is asked at a Done door that is saved as one (the outcome is the poll's anchor). */}
        {poll.length > 0 && stop.result.outcome === "DONE" && stop.pollMine && <WorkerPollForm key={stop.id} stopId={stop.id} questions={poll} answers={stop.poll ?? []} locked={stop.pollLocked ?? []} />}
        {/* A Done carried over from an earlier holder: the poll is asked by whoever reached the door, so they record it Done themselves first (the server refuses otherwise). */}
        {poll.length > 0 && stop.result.outcome === "DONE" && !stop.pollMine && <p className="border-t border-border px-3 py-2.5 text-sm text-muted">This door was recorded as Done by someone else. Save it as Done yourself to ask the poll.</p>}
        {poll.length > 0 && stop.result.outcome !== "DONE" && <p className="border-t border-border px-3 py-2.5 text-sm text-muted">This job has a poll. Save this door as Done to ask it.</p>}
        </>
      )}
    </li>
  );
}
