import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireArea } from "@/lib/employer-session";
import { canUse } from "@/lib/access";
import { UUID_RE } from "@/lib/jobs";
import { loadJobWalkbooks } from "@/lib/walkbooks-data";
import { ReadingPage } from "@/components/layout/Page";
import { Masthead } from "@/components/Masthead";
import { ActionButton } from "@/components/ActionButton";
import { LocalTime } from "@/components/LocalTime";
import { OutcomeLegend, ProgressBar } from "@/components/stops/Outcomes";
import { WalkbookImport } from "@/components/staff/WalkbookImport";
import { WalkbookCut } from "@/components/staff/WalkbookCut";
import { assignWalkbookAction, deleteFileDataAction } from "./actions";
import { RETENTION_DAYS, SOURCE_SYSTEMS } from "@/lib/walkbooks";
import { loadPollSetup } from "@/lib/poll-data";
import { PollSetup } from "@/components/staff/PollSetup";

/**
 * A job's walkbooks (W1): bring an authorized file, cut its addresses into
 * numbered walkbooks, hand each to a worker hired on the job. Anyone who can
 * see the field sees this page; those who run it make the changes.
 */
const PAGE_SIZE = 25;

export default async function JobWalkbooksPage({ params, searchParams }: { params: Promise<{ jobId: string }>; searchParams: Promise<{ page?: string }> }) {
  const { jobId } = await params;
  const { page: pageRaw } = await searchParams;
  if (!UUID_RE.test(jobId)) notFound();
  const session = await requireArea("field", "read");
  const data = await loadJobWalkbooks(session.orgId, jobId);
  if (!data) notFound();
  const canEdit = canUse(session, "field");
  const { job, books, imports, hired } = data;
  // A canvass job's poll: anyone who sees the field sees the questions; job editors change them.
  const poll = job.type === "CANVASS" ? await loadPollSetup(session.orgId, job.id) : null;
  const pages = Math.max(1, Math.ceil(books.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, /^\d{1,6}$/.test(pageRaw ?? "") ? Number(pageRaw) : 1));
  const shown = books.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const stopTotal = books.reduce((n, b) => n + b.stops, 0);
  const settled = books.reduce((n, b) => n + b.progress.settled, 0);
  const signatures = books.reduce((n, b) => n + b.progress.signatures, 0);
  const handedOut = books.filter((b) => b.holder?.stillHired).length;
  const importLabel = (i: (typeof imports)[number]) => `${i.fileName} (${i.recordSource})`;

  return (
    <ReadingPage
      org
      head={
        <Masthead eyebrow={job.title} title="Walkbooks">
          <Link transitionTypes={["nav-back"]} href={`/jobs/${job.id}`} className="btn-ghost">
            <ChevronLeft aria-hidden className="size-4 shrink-0" />
            Job
          </Link>
          {books.length > 0 && (
            <Link href={`/jobs/${job.id}/walkbooks/console`} className="btn-secondary btn-sm">
              Console
            </Link>
          )}
        </Masthead>
      }
    >
      <section className="section">
        <h2 className="section-title">Walkbooks on this job</h2>
        {books.length > 0 && (
          <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[
              ["Walkbooks", books.length],
              ["Stops", stopTotal],
              ["Handed out", `${handedOut} of ${books.length}`],
              [job.type === "PETITION" ? "Signatures" : "Settled", job.type === "PETITION" ? signatures : `${stopTotal ? Math.round((settled / stopTotal) * 100) : 0}%`],
            ].map(([label, value]) => (
              <div key={label} className="card !p-3">
                <dd className="text-xl font-bold tabular-nums text-fg sm:text-2xl">{typeof value === "number" ? value.toLocaleString("en-US") : value}</dd>
                <dt className="text-xs text-muted sm:text-sm">{label}</dt>
              </div>
            ))}
          </dl>
        )}
        {books.length > 0 && <OutcomeLegend />}
        {books.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No walkbooks yet</p>
            <p className="empty-state-body">{canEdit ? "Import an address file below, then cut it into numbered walkbooks." : "Someone who runs the field can import an address file and cut walkbooks."}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {shown.map((b) => {
              const others = hired.filter((h) => h.engagementId !== b.holder?.engagementId);
              return (
                <li key={b.id} className="card space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-base font-bold tabular-nums text-fg ring-1 ring-border" aria-hidden>
                      {b.number}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <Link href={`/jobs/${job.id}/walkbooks/${b.id}`} className="block font-bold text-fg underline-offset-2 hover:underline">
                        {b.name}
                      </Link>
                      <p className="text-muted-sm">
                        {b.stops} {b.stops === 1 ? "stop" : "stops"}
                      </p>
                      <ProgressBar progress={b.progress} />
                      <p className={`text-sm font-semibold ${b.holder ? (b.holder.stillHired ? "text-success-msg" : "text-danger-msg") : "text-muted"}`}>
                        {b.holder ? (
                          <>
                            With {b.holder.name}
                            {!b.holder.stillHired && " · no longer hired: take it back or hand it on"}
                          </>
                        ) : (
                          "Not handed out"
                        )}
                      </p>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap items-start gap-4">
                      {/* Stays mounted once the only hired worker holds it, so the hand-over still says it worked. */}
                      {hired.length > 0 && (
                        <details className="group">
                          <summary className="btn-secondary btn-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden" aria-label={`${b.holder ? "Hand on" : "Hand out"} ${b.name}`}>
                            {b.holder ? "Hand on" : "Hand out"}
                          </summary>
                          <div className="mt-2">
                            <ActionButton action={assignWalkbookAction} fields={{ walkbookId: b.id }} label="Hand over" pendingLabel="Saving…" variant="btn-primary btn-sm" ariaLabel={`Hand over ${b.name}`} disabled={others.length === 0}>
                              <label className="space-y-1.5">
                                <span className="label">Hired worker</span>
                                <select name="engagementId" className="field" required defaultValue="" disabled={others.length === 0}>
                                  <option value="" disabled>
                                    {others.length ? "Choose…" : "Nobody else is hired here"}
                                  </option>
                                  {others.map((h) => (
                                    <option key={h.engagementId} value={h.engagementId}>
                                      {h.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </ActionButton>
                          </div>
                        </details>
                      )}
                      {b.holder && (
                        <ActionButton
                          action={assignWalkbookAction}
                          fields={{ walkbookId: b.id, engagementId: "" }}
                          label="Take back"
                          pendingLabel="Taking back…"
                          variant="btn-ghost btn-sm"
                          ariaLabel={`Take back ${b.name}`}
                          confirm={{ text: `${b.holder.name} stops seeing this walkbook. Who held it, and when, stays in its history.`, label: "Take it back" }}
                        />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {pages > 1 && (
          <nav aria-label="Walkbook pages" className="flex items-center justify-between gap-3">
            {page > 1 ? <Link href={`/jobs/${job.id}/walkbooks?page=${page - 1}`} className="btn-secondary btn-sm">Earlier books</Link> : <span />}
            <span className="text-muted-sm">Books {(page - 1) * PAGE_SIZE + 1}–{Math.min(books.length, page * PAGE_SIZE)} of {books.length.toLocaleString("en-US")}</span>
            {page < pages ? <Link href={`/jobs/${job.id}/walkbooks?page=${page + 1}`} className="btn-secondary btn-sm">Later books</Link> : <span />}
          </nav>
        )}
        {canEdit && books.length > 0 && hired.length === 0 && <p className="text-hint">Hire someone on this job first: only hired workers can hold its walkbooks.</p>}
      </section>

      {poll && (
        <section className="section">
          <h2 className="section-title">Poll</h2>
          <p className="text-muted-sm">
            Questions workers can ask at a door they mark as Done. Each has fixed answer choices (no free text), and a resident can decline. Answers can be changed afterwards; the earlier answer stays in the history. Only people with full access to the field area read them.
          </p>
          <PollSetup jobId={job.id} current={poll.current} earlier={poll.earlier} canEdit={canUse(session, "jobsEdit")} />
        </section>
      )}

      {canEdit && imports.length > 0 && (
        <section className="section">
          <h2 className="section-title">Cut walkbooks</h2>
          <WalkbookCut jobId={job.id} imports={imports.map((i) => ({ id: i.id, label: importLabel(i), unassigned: i.unassigned }))} />
        </section>
      )}

      {canEdit && (
        <section className="section">
          <h2 className="section-title">Import an address file</h2>
          <p className="text-muted-sm">
            Bring a file your organization is authorized to use: a voter file, a supporter list, a customer list. Each row&apos;s address, its record ID (so your return file can be matched) and every other column are stored for {RETENTION_DAYS} days, then deleted. They are never shown to workers or used to match or rank anyone. You can delete them sooner.
          </p>
          <WalkbookImport jobId={job.id} />
        </section>
      )}

      {imports.length > 0 && (
        <section className="section">
          <h2 className="section-title">Your organization&apos;s files</h2>
          <ul className="space-y-3">
            {imports.map((i) => (
              <li key={i.id} className="card space-y-1">
                <p className="font-bold text-fg">{i.fileName}</p>
                <p className="text-muted-sm">
                  Imported <LocalTime iso={i.createdAt.toISOString()} mode="date" /> · {i.keptCount.toLocaleString("en-US")} of {i.rowCount.toLocaleString("en-US")} rows kept ·{" "}
                  {i.unassigned.toLocaleString("en-US")} not yet on this job&apos;s walkbooks
                </p>
                <p className={`text-sm font-semibold ${i.purgedAt ? "text-muted" : "text-fg"}`}>
                  {i.purgedAt ? (
                    <>
                      The file's data (addresses and every other column) deleted <LocalTime iso={i.purgedAt.toISOString()} mode="date" />. The stops and outcomes remain.
                    </>
                  ) : (
                    <>
                      Its addresses and every other column are deleted <LocalTime iso={i.deleteAfter.toISOString()} mode="date" />, or sooner if you delete them or every job this file is cut for closes.
                    </>
                  )}
                </p>
                {canEdit && !i.purgedAt && (
                  <ActionButton
                    action={deleteFileDataAction}
                    fields={{ importId: i.id, jobId: job.id }}
                    label="Delete this file's data now"
                    pendingLabel="Deleting…"
                    variant="btn-secondary btn-sm"
                    ariaLabel={`Delete the data of ${i.fileName} now`}
                    confirm={{ text: "The addresses, record IDs and every other column of this file are deleted for good. Walkbooks already cut keep their stops and outcomes but lose their addresses. This can't be undone; import the file again to bring them back.", label: "Delete them now" }}
                  />
                )}
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  {i.sourceSystem && (
                    <>
                      <dt className="text-hint">System</dt>
                      <dd className="min-w-0 break-words text-fg">{SOURCE_SYSTEMS.find((x) => x.value === i.sourceSystem)?.label ?? i.sourceSystem}</dd>
                    </>
                  )}
                  <dt className="text-hint">Source</dt>
                  <dd className="min-w-0 break-words text-fg">{i.recordSource}</dd>
                  <dt className="text-hint">Purpose</dt>
                  <dd className="min-w-0 break-words text-fg">{i.purpose}</dd>
                  <dt className="text-hint">License</dt>
                  <dd className="min-w-0 break-words text-fg">{i.license}</dd>
                  {i.droppedColumns.length > 0 && (
                    <>
                      <dt className="text-hint">Never stored</dt>
                      <dd className="min-w-0 break-words text-fg">{i.droppedColumns.join(", ")}</dd>
                    </>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        </section>
      )}
    </ReadingPage>
  );
}
