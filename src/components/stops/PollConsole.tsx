import { LocalTime } from "@/components/LocalTime";
import { StaffPollForm } from "@/components/stops/StaffPollForm";
import { answerWord, DECLINED, type PollQuestionView, type Tally } from "@/lib/poll";
import type { loadStopPollHistory } from "@/lib/poll-data";

type History = NonNullable<Awaited<ReturnType<typeof loadStopPollHistory>>>;

/**
 * What residents answered, question by question: counts of each choice and of
 * Declined among the newest answers. Counts are per question and in the
 * poll's own order: nothing is combined across questions, split by worker,
 * ranked or scored (CLAUDE.md rules 4 and 5).
 */
export function PollResults({ current, earlier }: { current: Tally[]; earlier: Tally[] }) {
  const bar = (t: Tally) => (
    <li key={t.questionId} className="card space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold text-fg">{t.prompt}</h3>
        <span className="shrink-0 text-xs tabular-nums text-muted">{t.total} {t.total === 1 ? "answer" : "answers"}</span>
      </div>
      <ul className="space-y-2">
        {[...t.choices.map((c) => ({ key: c.id, label: c.label, n: c.n })), { key: DECLINED, label: "Declined", n: t.declined }].map((c) => (
          <li key={c.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={c.key === DECLINED ? "text-muted" : "text-fg"}>{c.label}</span>
              <span className="tabular-nums text-fg">
                {c.n}
                {t.total > 0 && <span className="text-muted"> · {Math.round((c.n / t.total) * 100)}%</span>}
              </span>
            </div>
            <div role="img" aria-label={`${c.label}: ${c.n} of ${t.total}`} className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-fg/70" style={{ width: t.total ? `${(c.n / t.total) * 100}%` : 0 }} />
            </div>
          </li>
        ))}
      </ul>
    </li>
  );
  return (
    <div className="space-y-3">
      <ul className="space-y-3">{current.map(bar)}</ul>
      {earlier.some((t) => t.total > 0) && (
        <details className="text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-fg">Earlier wording that has answers</summary>
          <ul className="mt-3 space-y-3">{earlier.filter((t) => t.total > 0).map(bar)}</ul>
        </details>
      )}
    </div>
  );
}

/** One stop's poll for staff with full field access: the current answers (editable), then every row ever given, newest first, with who and when. */
export function StopPollPanel({ stopId, data }: { stopId: string; data: History }) {
  const current = data.questions.filter((q) => q.current);
  const views: PollQuestionView[] = current.map((q) => ({ id: q.id, position: q.position, prompt: q.prompt, choices: q.choices }));
  const newest = new Map<string, History["history"][number]>();
  for (const h of data.history) if (!newest.has(h.questionId)) newest.set(h.questionId, h); // history is newest first
  const values = Object.fromEntries([...newest].filter(([id]) => current.some((q) => q.id === id)).map(([id, h]) => [id, h.declined ? DECLINED : (h.choiceId ?? "")]));
  const byQuestion = new Map(data.questions.map((q) => [q.id, q]));
  return (
    <section aria-label="Poll answers at this stop" className="card space-y-3">
      <h2 className="text-lg font-bold text-fg">Poll</h2>
      {views.length > 0 && (
        <dl className="space-y-1.5">
          {views.map((q) => {
            const a = newest.get(q.id);
            return (
              <div key={q.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <dt className="text-sm text-muted">{q.prompt}</dt>
                <dd className="text-sm font-semibold text-fg">{a ? answerWord(q, a) : "Not asked"}</dd>
              </div>
            );
          })}
        </dl>
      )}
      {views.length > 0 && <StaffPollForm stopId={stopId} questions={views} values={values} />}
      {data.history.length > 0 && (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-fg">History ({data.history.length})</summary>
          <ol className="mt-2 space-y-2 border-l-2 border-border pl-4 text-sm">
            {data.history.map((h) => {
              const q = byQuestion.get(h.questionId);
              return (
                <li key={h.id} className="space-y-0.5">
                  <p className="text-fg">
                    <span className="text-muted">{q?.prompt ?? "Question"}: </span>
                    <span className="font-semibold">{q ? answerWord(q, h) : "—"}</span>
                    {q && !q.current && <span className="text-muted"> (earlier wording)</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {h.by} · <LocalTime iso={h.at.toISOString()} mode="short" />
                  </p>
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </section>
  );
}
