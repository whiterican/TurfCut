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
import { WalkbookImport } from "@/components/staff/WalkbookImport";
import { WalkbookCut } from "@/components/staff/WalkbookCut";
import { assignWalkbookAction } from "./actions";

/**
 * A job's walkbooks (W1): bring an authorized file, cut its addresses into
 * numbered walkbooks, hand each to a worker hired on the job. Anyone who can
 * see the field sees this page; those who run it make the changes.
 */
export default async function JobWalkbooksPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) notFound();
  const session = await requireArea("field", "read");
  const data = await loadJobWalkbooks(session.orgId, jobId);
  if (!data) notFound();
  const canEdit = canUse(session, "field");
  const { job, books, imports, hired } = data;
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
        </Masthead>
      }
    >
      <section className="section">
        <h2 className="section-title">Walkbooks on this job</h2>
        {books.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No walkbooks yet</p>
            <p className="empty-state-body">{canEdit ? "Import an address file below, then cut it into numbered walkbooks." : "Someone who runs the field can import an address file and cut walkbooks."}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {books.map((b) => {
              const others = hired.filter((h) => h.engagementId !== b.holder?.engagementId);
              return (
                <li key={b.id} className="card space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <Link href={`/jobs/${job.id}/walkbooks/${b.id}`} className="font-bold text-fg underline-offset-2 hover:underline">
                        {b.name}
                      </Link>
                      <p className="text-muted-sm">
                        {b.stops} {b.stops === 1 ? "stop" : "stops"} ·{" "}
                        {b.holder ? (
                          <>
                            with {b.holder.name}
                            {!b.holder.stillHired && " (no longer hired: take it back or hand it on)"}
                          </>
                        ) : (
                          "not handed out"
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
        {canEdit && books.length > 0 && hired.length === 0 && <p className="text-hint">Hire someone on this job first: only hired workers can hold its walkbooks.</p>}
      </section>

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
            Bring a file your organization is authorized to use: a voter file, a supporter list, a customer list. Only the address of each row is kept. Names, party, vote history and every other column are dropped before
            anything is stored.
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
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-hint">Source</dt>
                  <dd className="min-w-0 break-words text-fg">{i.recordSource}</dd>
                  <dt className="text-hint">Purpose</dt>
                  <dd className="min-w-0 break-words text-fg">{i.purpose}</dd>
                  <dt className="text-hint">License</dt>
                  <dd className="min-w-0 break-words text-fg">{i.license}</dd>
                  {i.droppedColumns.length > 0 && (
                    <>
                      <dt className="text-hint">Dropped</dt>
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
