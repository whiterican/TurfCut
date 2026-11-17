import Link from "next/link";
import { X } from "lucide-react";
import { LocalTime } from "@/components/LocalTime";
import { OutcomeChip } from "@/components/stops/Outcomes";
import { stopColor, type StopView } from "@/components/stops/StopLine";
import { consoleHref, type ConsoleQuery, type OutcomeFilter } from "@/lib/stop-console";
import type { ConsoleStop, WorkerLine } from "@/lib/stop-console-data";
import { answerWords, OUTCOMES, outcomeLook, UNVISITED_COLOR, type OutcomeKind, type StopState } from "@/lib/stop-outcomes";

/** Outcome filters with whole-job counts. A link each (no script): the page is the state. */
export function FilterChips({ base, q, todo, count }: { base: string; q: ConsoleQuery; todo: number; count: (k: OutcomeKind) => number }) {
  const items: Array<{ key: OutcomeFilter | null; label: string; n: number | null; color: string | null }> = [
    { key: null, label: "All", n: null, color: null },
    { key: "todo", label: "To do", n: todo, color: UNVISITED_COLOR },
    ...OUTCOMES.map((o) => ({ key: o.kind as OutcomeFilter, label: o.label, n: count(o.kind), color: o.color })),
  ];
  return (
    <nav aria-label="Filter by outcome" className="flex flex-wrap gap-2">
      {items.map((i) => {
        const on = q.outcome === i.key;
        return (
          <Link
            key={i.label}
            href={consoleHref(base, q, { outcome: i.key })}
            aria-current={on ? "true" : undefined}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold text-fg transition ${on ? "border-fg bg-surface-2" : "border-border bg-surface hover:bg-surface-2"}`}
          >
            {i.color && <span aria-hidden className="size-2.5 rounded-full" style={{ background: i.color }} />}
            {i.label}
            {i.n !== null && <span className="tabular-nums text-muted">{i.n.toLocaleString("en-US")}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

const street = (s: { line1: string; unit: string | null }) => `${s.line1}${s.unit ? `, ${s.unit}` : ""}`;

/** The stops as a table from 768px and as cards below it: a desktop table is never squeezed onto a phone. */
export function ConsoleTable({ base, q, stops, holderName }: { base: string; q: ConsoleQuery; stops: ConsoleStop[]; holderName: (id: string | null) => string | null }) {
  if (!stops.length) return <p className="text-muted-sm">No stops match these filters.</p>;
  // To the inspector, which takes focus: #stop-history. The links don't scroll to the top first.
  const open = (s: ConsoleStop) => `${consoleHref(base, q, { stop: s.id })}#stop-history`;
  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <caption className="sr-only">Stops</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 pr-3 font-semibold">Stop</th>
            <th scope="col" className="py-2 pr-3 font-semibold">Address</th>
            <th scope="col" className="py-2 pr-3 font-semibold">Outcome</th>
            <th scope="col" className="py-2 pr-3 font-semibold">Recorded</th>
            <th scope="col" className="py-2 font-semibold">Held by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {stops.map((s) => {
            const on = q.stopId === s.id;
            return (
              <tr key={s.id} aria-current={on ? "true" : undefined} className={on ? "bg-surface-2" : "hover:bg-surface-2/60"}>
                <td className="relative py-2.5 pl-3 pr-3 tabular-nums text-fg">
                  <span aria-hidden className="absolute inset-y-1 left-0 w-1 rounded-full" style={{ background: stopColor(s as unknown as StopView) }} />
                  <Link href={open(s)} scroll={false} className="font-semibold underline-offset-2 hover:underline">
                    {s.bookNumber}.{s.stopNumber}
                    <span className="sr-only"> history, {street(s)}</span>
                  </Link>
                </td>
                <td className="py-2.5 pr-3 text-fg">
                  <span className="block font-medium">{street(s)}</span>
                  <span className="block text-xs text-muted">{s.city}, {s.state} {s.zip}</span>
                </td>
                <td className="py-2.5 pr-3">
                  <OutcomeChip kind={s.result.outcome} />
                  {answerWords(s.result).length > 0 && <span className="mt-1 block text-xs text-muted">{answerWords(s.result).join(" · ")}</span>}
                </td>
                <td className="py-2.5 pr-3 text-muted">{s.recordedAt ? <LocalTime iso={s.recordedAt.toISOString()} mode="short" /> : "—"}</td>
                <td className="py-2.5 text-fg">{holderName(s.holderEngagementId) ?? <span className="text-muted">Not handed out</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="list-card divide-y divide-border md:hidden">
        {stops.map((s) => (
          <li key={s.id} className="relative">
            <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: stopColor(s as unknown as StopView) }} />
            <Link href={open(s)} scroll={false} className="block space-y-1 py-3 pl-4 pr-3">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-fg">{street(s)}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted">{s.bookNumber}.{s.stopNumber}</span>
              </span>
              <span className="block text-sm text-muted">{s.city}, {s.state} {s.zip}</span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <OutcomeChip kind={s.result.outcome} />
                <span className="text-xs text-muted">{holderName(s.holderEngagementId) ?? "Not handed out"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Pager({ base, q, page, pages, total, size }: { base: string; q: ConsoleQuery; page: number; pages: number; total: number; size: number }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3">
      {page > 1 ? <Link href={consoleHref(base, q, { page: page - 1 > 1 ? String(page - 1) : null })} className="btn-secondary btn-sm">Earlier</Link> : <span />}
      <span className="text-muted-sm">
        {((page - 1) * size + 1).toLocaleString("en-US")}–{Math.min(total, page * size).toLocaleString("en-US")} of {total.toLocaleString("en-US")}
      </span>
      {page < pages ? <Link href={consoleHref(base, q, { page: String(page + 1) })} className="btn-secondary btn-sm">Later</Link> : <span />}
    </nav>
  );
}

type History = NonNullable<Awaited<ReturnType<typeof import("@/lib/stop-console-data").loadStopHistory>>>;

/** One stop's whole history, newest first: what was recorded, by whom, when. Corrections are rows of their own; nothing is overwritten. */
export function StopInspector({ stop, closeHref }: { stop: History; closeHref: string }) {
  const a = stop.address;
  return (
    <section id="stop-history" tabIndex={-1} aria-label={`History of stop ${stop.stopNumber}`} className="card scroll-mt-4 space-y-3 outline-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{stop.book.name} · stop {stop.stopNumber}</p>
          <h2 className="text-lg font-bold text-fg">{street(a)}</h2>
          <p className="text-muted-sm">{a.city}, {a.state} {a.zip}</p>
        </div>
        <Link href={closeHref} scroll={false} className="grid size-11 shrink-0 place-items-center rounded-full text-fg hover:bg-surface-2" aria-label="Close history">
          <X aria-hidden className="size-5" />
        </Link>
      </div>
      {stop.history.length === 0 ? (
        <p className="text-muted-sm">Nothing recorded at this door yet.</p>
      ) : (
        <ol className="space-y-3 border-l-2 border-border pl-4">
          {stop.history.map((h, i) => {
            const state: StopState = { outcome: h.outcome, answers: h.answers };
            const words = answerWords(state);
            return (
              <li key={h.id} className="relative space-y-1">
                <span aria-hidden className="absolute -left-[1.4rem] top-1.5 size-3 rounded-full ring-2 ring-surface" style={{ background: outcomeLook(h.outcome).color }} />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <OutcomeChip kind={h.outcome} />
                  {i === 0 && <span className="text-xs font-semibold text-muted">Latest</span>}
                </div>
                {words.length > 0 && <p className="text-sm text-fg">{words.join(" · ")}</p>}
                <p className="text-xs text-muted">
                  {h.by} · <LocalTime iso={h.at.toISOString()} mode="short" />
                </p>
              </li>
            );
          })}
        </ol>
      )}
      {stop.historyTruncated && <p className="text-hint">Showing the latest 50 entries.</p>}
    </section>
  );
}

/**
 * Who holds which books now, and what each person recorded themselves. The two
 * are shown apart because a book carries its state to its next holder: a hand-on
 * moves the book, never the credit. No totals, percentages or rankings of people
 * (rule 5). A name filters the table to the books that person holds now.
 */
export function WorkerTable({ base, q, workers, signatures }: { base: string; q: ConsoleQuery; workers: WorkerLine[]; signatures: boolean }) {
  if (!workers.length) return <p className="text-muted-sm">No walkbook is handed out yet.</p>;
  return (
    <div className="data-table-wrap overflow-x-auto" tabIndex={0} role="region" aria-label="Workers">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 pr-3 font-semibold">Worker</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Holds now</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Recorded</th>
            {signatures && <th scope="col" className="py-2 text-right font-semibold">Signatures recorded</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {workers.map((w) => (
            <tr key={w.engagementId}>
              <td className="py-2.5 pr-3 text-fg">
                <Link href={consoleHref(base, q, { worker: w.engagementId })} className="font-semibold underline-offset-2 hover:underline">{w.name}</Link>
                {!w.stillHired && <span className="ml-2 text-xs font-semibold text-danger-msg">no longer hired</span>}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{w.books === 0 ? "—" : `${w.books} ${w.books === 1 ? "book" : "books"} · ${w.stops} stops`}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{w.recordedSettled} settled</td>
              {signatures && <td className="py-2.5 text-right tabular-nums">{w.recordedSignatures}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
