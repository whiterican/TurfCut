import Link from "next/link";
import { requireStaff } from "@/lib/staff-session";
import { filterQuery, LEDGER_MOMENTS, listAuditVocabulary, loadTimeline, parseAuditFilter, parseCursor, TIMELINE_PAGE } from "@/lib/admin-audit-data";
import { LocalTime } from "@/components/LocalTime";

/** A compact line of a record's details, for scanning; the full record stays in the table. */
function compact(metadata: unknown): string | null {
  if (metadata === null || metadata === undefined) return null;
  const s = JSON.stringify(metadata);
  if (!s || s === "{}" || s === "null") return null;
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

/** The audit viewer (M10.4): every recorded act, the organizations' own and Turfcut's, newest first, with filters. */
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const sp = await searchParams;
  const filter = parseAuditFilter(sp);
  const cursor = parseCursor(Array.isArray(sp.after) ? sp.after[0] : sp.after);
  const [{ rows, next }, vocab] = await Promise.all([loadTimeline(filter, cursor), listAuditVocabulary()]);
  const active = filterQuery(filter);
  return (
    <>
      <form method="get" action="/admin/audit" className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block space-y-1.5">
          <span className="label">Kind</span>
          <input name="kind" list="audit-kinds" className="field" defaultValue={filter.kind ?? ""} placeholder="job.published, member., payout…" />
          <datalist id="audit-kinds">{vocab.kinds.map((k) => <option key={k} value={k} />)}</datalist>
        </label>
        <label className="block space-y-1.5">
          <span className="label">Record type</span>
          <select name="type" className="field" defaultValue={filter.entityType ?? ""}>
            <option value="">Any</option>
            {vocab.entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            {filter.entityType && !vocab.entityTypes.includes(filter.entityType) && <option value={filter.entityType}>{filter.entityType} (no such record type)</option>}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="label">Record id</span>
          <input name="id" className="field font-mono" defaultValue={filter.entityId ?? ""} />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Actor (account id)</span>
          <input name="actor" className="field font-mono" defaultValue={filter.actorId ?? ""} />
        </label>
        <label className="block space-y-1.5">
          <span className="label">From (UTC day)</span>
          <input type="date" name="from" className="field" defaultValue={filter.from?.toISOString().slice(0, 10) ?? ""} />
        </label>
        <label className="block space-y-1.5">
          <span className="label">To (UTC day)</span>
          <input type="date" name="to" className="field" defaultValue={filter.to?.toISOString().slice(0, 10) ?? ""} />
        </label>
        <label className="flex items-center gap-2 text-sm text-fg sm:col-span-2">
          <input type="checkbox" name="ledger" value="1" defaultChecked={filter.ledger} />
          Ledger moments only: {LEDGER_MOMENTS.join(", ")}
        </label>
        <div className="flex items-center gap-3">
          <button className="btn-primary btn-sm">Filter</button>
          {active && <Link href="/admin/audit" className="link text-sm">Clear</Link>}
        </div>
      </form>

      <section className="section" aria-labelledby="timeline">
        <h2 id="timeline" className="section-title">Timeline <span className="text-xs font-medium text-subtle">{rows.length === TIMELINE_PAGE || next ? `newest ${TIMELINE_PAGE}` : `${rows.length}`}{cursor ? " · continued" : ""}</span></h2>
        {rows.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">Nothing matches</p>
            <p className="empty-state-body">Loosen a filter, or clear them all.</p>
          </div>
        ) : (
          <ul className="list-card">
            {rows.map((r) => {
              const details = compact(r.metadata);
              return (
                <li key={`${r.source}-${r.id}`} className="space-y-1 px-4 py-3">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm text-fg">{r.action}</span>
                      {r.source === "staff" && <span className="badge-sky">Turfcut staff</span>}
                    </span>
                    <span className="text-xs text-subtle"><LocalTime iso={r.createdAt.toISOString()} mode="full" /></span>
                  </p>
                  <p className="text-sm text-muted">
                    {r.actorName ?? "System"}
                    {r.orgName ? <> · {r.orgName}</> : null}
                    {" · "}{r.entityType}{" "}
                    {r.href ? <Link href={r.href} className="link font-mono text-xs">{r.entityType === "Worker" ? "account" : r.entityId.slice(0, 8)}</Link> : <span className="font-mono text-xs">{r.entityId.slice(0, 8)}</span>}
                  </p>
                  {r.reason && <p className="text-sm text-fg">{r.reason}</p>}
                  {details && <p className="font-mono text-xs text-subtle break-all">{details}</p>}
                  {r.withheld && <p className="text-xs text-subtle">Details withheld: a worker&apos;s own record.</p>}
                </li>
              );
            })}
          </ul>
        )}
        {next && (
          <p>
            <Link href={`/admin/audit${filterQuery(filter, next)}`} className="btn-secondary btn-sm">Older</Link>
          </p>
        )}
      </section>
    </>
  );
}
