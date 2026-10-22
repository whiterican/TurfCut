import Link from "next/link";
import { requireStaff } from "@/lib/staff-session";
import { ROLE_LABELS } from "@/lib/access";
import { QUERY_MAX, QUERY_MIN, searchPeople } from "@/lib/admin-people-data";
import { LocalTime } from "@/components/LocalTime";

/** People lookup (M10.4): find an account to help, by sign-in email, name, campaign handle or id. */
export default async function AdminPeoplePage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requireStaff();
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const result = q ? await searchPeople(q) : { kind: null, hits: [] };
  return (
    <>
      <form method="get" action="/admin/people" className="card space-y-3">
        <label className="block space-y-1.5">
          <span className="label">Email, name, @campaign handle, or account id</span>
          <input name="q" className="field" defaultValue={q} minLength={QUERY_MIN} maxLength={QUERY_MAX} autoFocus placeholder="riley@… or Riley or @frontrange" />
        </label>
        <div className="flex items-center gap-3">
          <button className="btn-primary btn-sm">Search</button>
          <span className="text-hint">Shows who they are and where they belong. Never what a worker shares, their answers, their scorecard or their messages.</span>
        </div>
      </form>

      {q && (
        <section className="section" aria-labelledby="hits">
          <h2 id="hits" className="section-title">
            {result.kind === "email" ? "By sign-in email" : result.kind === "handle" ? "Members of the organization behind that handle" : result.kind === "id" ? "By account id" : result.kind === "name" ? "By name" : "Search"}
            <span className="ml-2 text-xs font-medium text-subtle">{result.hits.length}</span>
          </h2>
          {result.hits.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">Nobody matches</p>
              <p className="empty-state-body">{q.length < QUERY_MIN ? "Type at least two characters." : "Try the sign-in email, or the first few letters of the name."}</p>
            </div>
          ) : (
            <ul className="list-card">
              {result.hits.map((h) => (
                <li key={h.profileId}>
                  <Link transitionTypes={["nav-forward"]} href={`/admin/people/${h.profileId}`} className="block space-y-1 px-4 py-3 transition hover:bg-surface-2">
                    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="flex flex-wrap items-center gap-2 font-semibold text-fg">
                        {h.name ?? "No name yet"}
                        {h.staff && <span className="badge-sky">Turfcut staff</span>}
                        {h.closedAt && <span className="badge-neutral">Closed</span>}
                      </span>
                      <span className="text-xs text-subtle">since <LocalTime iso={h.createdAt.toISOString()} mode="fulldate" /></span>
                    </span>
                    <span className="block text-sm text-muted">
                      {ROLE_LABELS[h.role]}{h.org ? <> · {h.org.name}{h.org.standing === "awaiting" ? " (awaiting approval)" : h.org.standing === "withdrawn" ? " (approval withdrawn)" : ""}</> : h.role !== "WORKER" ? " · no organization" : null}{h.email ? <> · {h.email}</> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
