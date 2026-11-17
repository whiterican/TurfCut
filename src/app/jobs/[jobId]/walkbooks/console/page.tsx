import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download } from "lucide-react";
import { requireArea } from "@/lib/employer-session";
import { canUse } from "@/lib/access";
import { UUID_RE } from "@/lib/jobs";
import { CONSOLE_PAGE_SIZE, consoleHref, parseConsoleQuery } from "@/lib/stop-console";
import { loadConsole, loadStopHistory } from "@/lib/stop-console-data";
import { WorkspacePage } from "@/components/layout/Page";
import { Masthead } from "@/components/Masthead";
import { OutcomeLegend } from "@/components/stops/Outcomes";
import { ConsoleTable, FilterChips, Pager, StopInspector, WorkerTable } from "@/components/stops/ConsoleParts";
import { WalkbookMap } from "@/components/WalkbookStops";
import type { StopView } from "@/components/stops/StopLine";

/**
 * The walkbook console (W3): every stop on a job in one place, for the people
 * running the field. Filter by outcome, book or worker; see where the stops
 * are; open any stop to read its whole history; export what is on screen.
 * Read-only: nothing here changes a stop. The chips count the whole job; the
 * filters narrow the table and the map.
 */
export default async function ConsolePage({ params, searchParams }: { params: Promise<{ jobId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) notFound();
  const session = await requireArea("field", "read");
  const q = parseConsoleQuery(await searchParams);
  const data = await loadConsole(session.orgId, jobId, q);
  if (!data) notFound();
  const history = q.stopId ? await loadStopHistory(session.orgId, q.stopId, data.job.id) : null;
  const base = `/jobs/${data.job.id}/walkbooks/console`;
  const canExport = canUse(session, "field");
  const exportHref = `${base}/export${consoleHref("", { ...q, stopId: null, page: 1 }, {})}`;
  const filtered = !!(q.outcome || q.bookId || q.holderId);
  // The pins are state-coloured stops with the console's own shape; the map reads the stop view.
  const pins = data.pins as unknown as StopView[];

  return (
    <WorkspacePage
      head={
        <Masthead eyebrow={data.job.title} title="Walkbook console" meta={`${data.totalStops.toLocaleString("en-US")} ${data.totalStops === 1 ? "stop" : "stops"} on this job`}>
          <Link transitionTypes={["nav-back"]} href={`/jobs/${data.job.id}/walkbooks`} className="btn-ghost">
            <ChevronLeft aria-hidden className="size-4 shrink-0" />
            Walkbooks
          </Link>
          {canExport && (
            <a href={exportHref} className="btn-secondary btn-sm" download>
              <Download aria-hidden className="size-4" />
              Export {filtered ? "these" : "all"} as CSV
            </a>
          )}
        </Masthead>
      }
    >
      <section className="section">
        <FilterChips base={base} q={q} todo={data.counts.todo} count={data.counts.byKind} />
        <form method="get" action={base} className="flex flex-wrap items-end gap-3">
          {q.outcome && <input type="hidden" name="outcome" value={q.outcome} />}
          <label className="min-w-0 space-y-1.5">
            <span className="label">Walkbook</span>
            <select name="book" className="field" defaultValue={q.bookId ?? ""}>
              <option value="">All walkbooks</option>
              {data.books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-1.5">
            <span className="label">Held by</span>
            <select name="worker" className="field" defaultValue={q.holderId ?? ""}>
              <option value="">Anyone</option>
              <option value="none">Held by nobody</option>
              {data.workers.map((w) => (
                <option key={w.engagementId} value={w.engagementId}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-secondary btn-sm">Apply</button>
          {filtered && (
            <Link href={base} className="btn-ghost btn-sm">
              Clear filters
            </Link>
          )}
        </form>
        <OutcomeLegend />
      </section>

      <section className="section">
        <h2 className="section-title">Workers</h2>
        <WorkerTable base={base} q={q} workers={data.workers} signatures={data.job.type === "PETITION"} />
      </section>

      {history && <StopInspector stop={history} closeHref={consoleHref(base, q, { stop: null })} />}

      <section className="section">
        <h2 className="section-title">
          {data.total.toLocaleString("en-US")} {data.total === 1 ? "stop" : "stops"}
          {filtered ? " match" : ""}
        </h2>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
          <div className="min-w-0 space-y-3">
            <ConsoleTable base={base} q={q} stops={data.stops} holderName={data.holderName} />
            <Pager base={base} q={q} page={data.page} pages={data.pages} total={data.total} size={CONSOLE_PAGE_SIZE} />
          </div>
          {pins.length > 0 && (
            <div className="space-y-2 xl:sticky xl:top-4">
              <WalkbookMap stops={pins} className="h-72 xl:h-[32rem]" />
              {data.pinsTruncated && <p className="text-hint">Showing the first {pins.length} pinned stops. Filter to see the rest.</p>}
            </div>
          )}
        </div>
      </section>
    </WorkspacePage>
  );
}
