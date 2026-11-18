"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { recordPollAction, type OutcomeState } from "@/app/walkbooks/actions";
import { newId } from "@/lib/client-id";
import type { PollQuestionView } from "@/lib/poll";
import { PollFields, valuesOf } from "@/components/stops/PollFields";

const initial: OutcomeState = { ok: false, message: "", errors: {} };

/**
 * The poll at a Done door, for the worker holding the walkbook: what the
 * resident answered, as fixed choices. They can come back and change an answer;
 * the earlier one stays in the history. The device makes an id when the form
 * opens, so a double tap or a retry saves once.
 */
export function WorkerPollForm({ stopId, questions, answers }: { stopId: string; questions: PollQuestionView[]; answers: Array<{ questionId: string; choiceId: string | null; declined: boolean }> }) {
  const [state, dispatch, pending] = useActionState(recordPollAction, initial);
  const router = useRouter();
  // The tap's id is made when the form is submitted (never during render, which would differ from the server's) and kept until the save lands or is refused for a reason a retry could fix: a double tap or a retry carries the same id and saves once.
  const tapId = useRef<string | null>(null);
  useEffect(() => {
    // A save that may have landed (state.retry: a database timeout) keeps its id, so trying again counts it once.
    if (state.ok || (!state.gone && !state.retry && Object.keys(state.errors).length === 0 && state.message)) tapId.current = null;
  }, [state]);
  const action = (fd: FormData) => {
    fd.set("clientId", (tapId.current ??= newId()));
    return dispatch(fd);
  };
  return (
    <form action={action} className="space-y-3 border-t border-border bg-surface-2/50 px-3 pb-4 pt-3" aria-label="Poll">
      <input type="hidden" name="stopId" value={stopId} />
      <p className="label">Poll</p>
      <PollFields questions={questions} initial={valuesOf(answers)} idPrefix={`poll-${stopId}`} />
      <div className="flex items-center gap-3">
        <button className="btn-primary min-h-12 flex-1" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Saving…" : answers.length ? "Save changes" : "Save poll"}
        </button>
      </div>
      <p role="status" className={state.ok ? "text-success-msg" : "sr-only"}>{state.ok ? state.message : ""}</p>
      {state.message && !state.ok && (
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
  );
}
