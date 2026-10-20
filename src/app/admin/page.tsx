import { requireStaff } from "@/lib/staff-session";
import { loadAdminOverview } from "@/lib/admin-data";
import { SummaryBar } from "@/components/staff/SummaryBar";
import { LocalTime } from "@/components/LocalTime";

/** The console's front page (M10.1): the platform at a glance and the last staff acts. The queues themselves arrive in M10.2 to M10.5. */
export default async function AdminOverviewPage() {
  const session = await requireStaff();
  const o = await loadAdminOverview(session.userId);
  return (
    <>
      <SummaryBar
        label="The platform at a glance"
        items={[
          { label: "Awaiting approval", value: o.orgsAwaiting, hint: "Organizations" },
          { label: "Approved", value: o.orgsApproved, hint: "Organizations" },
          { label: "Jurisdictions", value: o.jurisdictionsCurrent, hint: o.jurisdictionsBlocked ? `${o.jurisdictionsBlocked} can't be used` : o.jurisdictionsCurrent ? "All usable" : "None on file" },
        ]}
      />

      <section className="section" aria-labelledby="recent-acts">
        <h2 id="recent-acts" className="section-title">Recent staff actions</h2>
        {o.recent.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">Nothing recorded yet</p>
            <p className="empty-state-body">Approvals, jurisdiction versions, verifications and support actions show up here with who did them and why.</p>
          </div>
        ) : (
          <ul className="list-card">
            {o.recent.map((a) => (
              <li key={a.id} className="space-y-1 px-4 py-3">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-mono text-sm text-fg">{a.action}</span>
                  <span className="text-xs text-subtle"><LocalTime iso={a.createdAt.toISOString()} mode="full" /></span>
                </p>
                <p className="text-sm text-muted">
                  {a.staffName}
                  {a.orgName ? <> · {a.orgName}</> : null} · {a.targetType} <span className="font-mono text-xs">{a.targetId.slice(0, 8)}</span>
                </p>
                <p className="text-sm text-fg">{a.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-hint">
        Signed in as Turfcut staff{o.staffSince ? <> since <LocalTime iso={o.staffSince.toISOString()} mode="fulldate" /></> : null}. Staff status is set by hand, never from this console.
      </p>
    </>
  );
}
