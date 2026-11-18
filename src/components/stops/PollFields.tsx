"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { DECLINED, type PollQuestionView } from "@/lib/poll";

/** What each question holds now: a choice id, "declined", or nothing. */
export type PollValues = Record<string, string>;

export function valuesOf(answers: Array<{ questionId: string; choiceId: string | null; declined: boolean }>): PollValues {
  return Object.fromEntries(answers.map((a) => [a.questionId, a.declined ? DECLINED : (a.choiceId ?? "")]));
}

/**
 * A poll's questions as radio groups: each question's fixed choices and a
 * built-in Declined. Chosen is said by a check as well as by colour. A
 * question can be left unanswered, but once answered it can only be changed,
 * not cleared; there is no free text anywhere.
 */
export function PollFields({ questions, initial, idPrefix, locked = [] }: { questions: PollQuestionView[]; initial: PollValues; idPrefix: string; /** Questions answered by someone else (a worker's form): no choices are offered and nothing is sent for them. */ locked?: string[] }) {
  const [values, setValues] = useState<PollValues>(initial);
  return (
    <div className="space-y-4">
      {questions.map((q, i) => (
        <fieldset key={q.id} className="space-y-2">
          <legend className="text-sm font-semibold text-fg">
            <span className="text-muted">{i + 1}. </span>
            {q.prompt}
          </legend>
          {locked.includes(q.id) && <p className="text-sm text-muted">Recorded by someone else. Ask a supervisor to change it.</p>}
          <div className={locked.includes(q.id) ? "hidden" : "flex flex-wrap gap-2"}>
            {(locked.includes(q.id) ? [] : [...q.choices, { id: DECLINED, label: "Declined" }]).map((c) => {
              const on = values[q.id] === c.id;
              return (
                <label
                  key={c.id}
                  htmlFor={`${idPrefix}-${q.id}-${c.id}`}
                  className={`relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-semibold text-fg transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] ${on ? "border-fg bg-surface-2" : "border-border bg-surface"} ${c.id === DECLINED ? "text-muted" : ""}`}
                >
                  <input
                    id={`${idPrefix}-${q.id}-${c.id}`}
                    type="radio"
                    name={`q_${q.id}`}
                    value={c.id}
                    checked={on}
                    // An answer can be changed to another choice, never taken back to blank: the history is append-only, so a recorded answer stays until a newer one replaces it.
                    onChange={() => setValues({ ...values, [q.id]: c.id })}
                    className="sr-only"
                  />
                  {on && <Check aria-hidden className="size-4 shrink-0" strokeWidth={3} />}
                  {c.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
