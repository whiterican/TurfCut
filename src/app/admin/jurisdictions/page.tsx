import Link from "next/link";
import { requireStaff } from "@/lib/staff-session";
import { listJurisdictionsForAdmin } from "@/lib/admin-jurisdictions-data";
import { LocalTime } from "@/components/LocalTime";
import { StandingChip } from "@/components/admin/StandingChip";

function placeName(p: { state: string; locality: string | null }) {
  return p.locality ? `${p.locality}, ${p.state}` : `${p.state}, statewide`;
}

/** Jurisdiction rule profiles (M10.3): every place, every version, and what the gate makes of each. */
export default async function AdminJurisdictionsPage() {
  await requireStaff();
  const places = await listJurisdictionsForAdmin();
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-sm max-w-prose">A job publishes, schedules and fills seats only under a current, approved, unexpired profile. A rule change is a new version: propose it, then record counsel&apos;s approval; jobs whose pay method fits move over, the rest freeze until their organization changes them.</p>
        <Link transitionTypes={["nav-forward"]} href="/admin/jurisdictions/new" className="btn-secondary btn-sm">New place</Link>
      </div>
      {places.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No profiles yet</p>
          <p className="empty-state-body">Propose the first place&apos;s rules, then approve them once counsel signs off.</p>
        </div>
      ) : (
        places.map((p) => {
          const current = p.versions.find((v) => v.standing === "current");
          return (
            <section key={`${p.state}|${p.locality ?? ""}`} className="section" aria-label={placeName(p)}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="section-title">{placeName(p)}</h2>
                <Link transitionTypes={["nav-forward"]} href={`/admin/jurisdictions/new?from=${(current ?? p.versions[0]).id}`} className="link text-sm font-medium">Propose a new version</Link>
              </div>
              <ul className="list-card">
                {p.versions.map((v) => (
                  <li key={v.id}>
                    <Link transitionTypes={["nav-forward"]} href={`/admin/jurisdictions/${v.id}`} className="block space-y-1 px-4 py-3 transition hover:bg-surface-2">
                      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="flex flex-wrap items-center gap-2 font-semibold text-fg">
                          Version {v.version} <StandingChip v={v} />
                        </span>
                        <span className="text-xs text-subtle">{v.jobs} open {v.jobs === 1 ? "job" : "jobs"}</span>
                      </span>
                      <span className="block text-sm text-muted">
                        {v.approved && v.approvedAt ? <>Approved <LocalTime iso={v.approvedAt.toISOString()} mode="fulldate" /></> : "Not approved"}
                        {v.approved && v.approvalExpiresAt && <> · expires <LocalTime iso={v.approvalExpiresAt.toISOString()} mode="fulldate" /></>}
                        {v.effectiveFrom && <> · effective <LocalTime iso={v.effectiveFrom.toISOString()} mode="fulldate" /></>}
                        {" · "}{v.rulesRead.compensationAllowed.length} pay {v.rulesRead.compensationAllowed.length === 1 ? "method" : "methods"}
                      </span>
                      {v.standing === "current" && v.problems.length > 0 && <span className="block text-sm text-warning-msg">{v.problems[0]}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}
