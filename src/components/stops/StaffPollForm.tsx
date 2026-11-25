"use client";

import { useActionState, useState } from "react";
import { staffPollAction, type PollFormState } from "@/app/jobs/[jobId]/walkbooks/poll-actions";
import type { PollQuestionView } from "@/lib/poll";
import { PollFields, type PollValues } from "@/components/stops/PollFields";

const initial: PollFormState = { ok: false, message: "", errors: {} };

/** Staff with full access to the field area change a stop's poll answers. The change is a row of its own; the earlier answer stays in the history below. */
export function StaffPollForm({ stopId, questions, values }: { stopId: string; questions: PollQuestionView[]; values: PollValues }) {
  const [state, action, pending] = useActionState(staffPollAction, initial);
  // The fields are keyed on what is saved, so they show the newest answers again after a save.
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        Edit answers
      </button>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-[var(--radius-inner)] border border-border bg-surface-2/50 p-3" aria-label="Edit poll answers">
      <input type="hidden" name="stopId" value={stopId} />
      <p className="text-hint">Saving adds a new answer as the current one. The earlier answer stays in the history, with who gave it.</p>
      <PollFields key={JSON.stringify(values)} questions={questions} initial={values} idPrefix={`staff-${stopId}`} />
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      {/* Always on the page, so a change to it is announced. */}
      <p role="status" className={state.message ? (state.ok ? "text-success-msg" : "text-danger-msg") : "sr-only"}>{state.message}</p>
    </form>
  );
}
