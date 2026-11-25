"use client";

import { useActionState, useEffect, useState } from "react";
import { addQuestionAction, changeQuestionAction, type PollFormState } from "@/app/jobs/[jobId]/walkbooks/poll-actions";
import { POLL_CHOICE_MAX, POLL_MAX_CHOICES, POLL_MAX_QUESTIONS, POLL_PROMPT_MAX, type PollQuestionView } from "@/lib/poll";
import { PendingButton } from "@/components/PendingButton";

const initial: PollFormState = { ok: false, message: "", errors: {} };

function QuestionForm({ jobId, question, onDone }: { jobId: string; question?: PollQuestionView; onDone?: (message: string) => void }) {
  const [state, action] = useActionState(question ? changeQuestionAction : addQuestionAction, initial);
  // Kept in state so a refused save doesn't clear them (React resets uncontrolled fields after an action).
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const [choices, setChoices] = useState(question?.choices.map((c) => c.label).join("\n") ?? "");
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    // Its own fields may be cleared while rendering; telling the parent (another component's state) waits for the effect below.
    if (state.ok && !question) {
      setPrompt("");
      setChoices("");
    }
  }
  useEffect(() => {
    if (state.ok) onDone?.(state.message);
  }, [state, onDone]);
  const err = (k: string) => (state.errors[k] ? <p className="field-error">{state.errors[k]}</p> : null);
  const n = choices.split(/\r?\n/).filter((l) => l.trim()).length;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="jobId" value={jobId} />
      {question && <input type="hidden" name="questionId" value={question.id} />}
      <label className="block space-y-1.5">
        <span className="label">Question</span>
        <input name="prompt" className="field" required maxLength={POLL_PROMPT_MAX} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Do you support Measure 3?" />
        {err("prompt")}
      </label>
      <label className="block space-y-1.5">
        <span className="label">Answer choices, one to a line</span>
        <textarea name="choices" className="field min-h-28" required value={choices} onChange={(e) => setChoices(e.target.value)} placeholder={"Support\nOppose\nUndecided"} aria-describedby={`choices-hint-${question?.id ?? "new"}`} />
        <span id={`choices-hint-${question?.id ?? "new"}`} className="text-hint block">
          {n} of {POLL_MAX_CHOICES} choices, each up to {POLL_CHOICE_MAX} characters. &ldquo;Declined&rdquo; is added for you. There is no free text: workers pick one of these.
        </span>
        {err("choices")}
      </label>
      <PendingButton pendingLabel="Saving…" doneLabel="Saved" result={state.message ? state : null} className="btn-secondary">
        {question ? "Save the new wording" : "Add question"}
      </PendingButton>
      {/* Always on the page, so a change to it is announced. */}
      <p role="status" className={state.message ? (state.ok ? "text-success-msg" : "text-danger-msg") : "sr-only"}>{state.message}</p>
    </form>
  );
}

/**
 * A canvass job's poll: its questions, and the forms to add or change them
 * (job editors only). Changing a question adds a new one that supersedes it;
 * the old wording and the answers given to it stay.
 */
export function PollSetup({ jobId, current, earlier, canEdit }: { jobId: string; current: PollQuestionView[]; earlier: Array<PollQuestionView & { replacedBy: string }>; canEdit: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // The form closes itself when it saves, so its confirmation is shown here, where it stays.
  const [notice, setNotice] = useState("");
  return (
    <div className="space-y-3">
      <p role="status" className={notice ? "text-success-msg" : "sr-only"}>{notice}</p>
      {current.length === 0 ? (
        <p className="text-muted-sm">No poll on this job.{canEdit ? " Add a question and workers can ask it at any door they mark as Done." : ""}</p>
      ) : (
        <ol className="space-y-3">
          {current.map((q) => (
            <li key={q.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-fg">
                  <span className="text-muted">{q.position}. </span>
                  {q.prompt}
                </p>
                {canEdit && editing !== q.id && (
                  <button type="button" className="btn-ghost shrink-0" onClick={() => { setNotice(""); setEditing(q.id); }} aria-label={`Change question ${q.position}`}>
                    Change
                  </button>
                )}
              </div>
              {editing === q.id ? (
                <div className="space-y-2">
                  <p className="text-hint">Saving adds the new wording as the current question. The old wording and the answers given to it stay as earlier wording.</p>
                  <QuestionForm jobId={jobId} question={q} onDone={(m) => { setNotice(m); setEditing(null); }} />
                  <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {q.choices.map((c) => (
                    <li key={c.id} className="rounded-full border border-border px-3 py-1 text-sm text-fg">{c.label}</li>
                  ))}
                  <li className="rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted">Declined</li>
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      {canEdit && current.length < POLL_MAX_QUESTIONS && (
        adding ? (
          <div className="card space-y-3">
            <QuestionForm jobId={jobId} onDone={(m) => { setNotice(m); setAdding(false); }} />
            <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="btn-secondary" onClick={() => { setNotice(""); setAdding(true); }}>
            Add a question
          </button>
        )
      )}
      {earlier.length > 0 && (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2.5 font-semibold text-fg">Earlier wording ({earlier.length})</summary>
          <ul className="mt-2 space-y-2">
            {earlier.map((q) => (
              <li key={q.id} className="text-muted">
                <span className="text-fg">{q.prompt}</span> — {q.choices.map((c) => c.label).join(" / ")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
