import Link from "next/link";
import { requireStaff } from "@/lib/staff-session";
import { loadAdminOverview } from "@/lib/admin-data";
import { listOrganizationsForAdmin } from "@/lib/admin-orgs-data";
import { EXPIRY_WINDOW_DAYS, jurisdictionsNeedingAttention, listJurisdictionsForAdmin, placeName } from "@/lib/admin-jurisdictions-data";
import { countAwaitingVerification } from "@/lib/campaign-admin-data";
import { LocalTime } from "@/components/LocalTime";

/** How many organizations the front page lists before pointing at the full queue. */
const ORG_PREVIEW = 5;

/**
 * The console's front page (M10.1, #116 admin slice). Every figure and row
 * comes from a loader the queue pages already use:
 * - counts and recent acts: `loadAdminOverview`
 * - organizations to approve: `listOrganizationsForAdmin().awaiting` (the queue's own order)
 * - rule profiles: `listJurisdictionsForAdmin()`, current versions only
 * - campaigns to verify: `countAwaitingVerification`
 */
export default async function AdminOverviewPage() {
  const session = await requireStaff();
  const now = new Date();
  const [o, orgs, places, campaignsAwaiting] = await Promise.all([
    loadAdminOverview(session.userId, now),
    listOrganizationsForAdmin(),
    listJurisdictionsForAdmin(now),
    countAwaitingVerification(),
  ]);
  const attention = jurisdictionsNeedingAttention(places.flatMap((p) => p.versions), now);
  // The band counts the same rows the lists below show, so the two can't disagree.
  const awaitingCount = orgs.awaiting.length;
  const blockedCount = attention.filter((a) => a.blocked).length;
  const waiting = orgs.awaiting.slice(0, ORG_PREVIEW);

  return (
    <>
      <section aria-labelledby="queues">
        <h2 id="queues" className="sr-only">Queues</h2>
        <dl className="summary-band">
          <div><dt><Link transitionTypes={["nav-forward"]} href="/admin/organizations" className="link">{awaitingCount === 1 ? "organization to approve" : "organizations to approve"}</Link></dt><dd>{awaitingCount}</dd></div>
          <div><dt><Link transitionTypes={["nav-forward"]} href="/admin/jurisdictions" className="link">{blockedCount === 1 ? "rule profile jobs can\u2019t publish under" : "rule profiles jobs can\u2019t publish under"}</Link></dt><dd>{blockedCount}</dd></div>
          <div><dt><Link transitionTypes={["nav-forward"]} href="/admin/campaigns" className="link">{campaignsAwaiting === 1 ? "campaign to verify" : "campaigns to verify"}</Link></dt><dd>{campaignsAwaiting}</dd></div>
          <div><dt>{orgs.approved.length === 1 ? "organization approved" : "organizations approved"}</dt><dd>{orgs.approved.length}</dd></div>
        </dl>
      </section>

      <section className="section" aria-labelledby="orgs-waiting">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="orgs-waiting" className="section-title">Organizations to approve</h2>
          {orgs.awaiting.length > 0 && <Link transitionTypes={["nav-forward"]} href="/admin/organizations" className="link text-sm font-medium">{orgs.awaiting.length > ORG_PREVIEW ? `All ${orgs.awaiting.length}` : "Open the queue"}</Link>}
        </div>
        {waiting.length === 0 ? (
          <p className="text-muted-sm">Nothing waiting. A new organization lands in the queue the moment someone signs it up.</p>
        ) : (
          <ul className="list-card">
            {waiting.map((org) => {
              const owner = org.owners[0];
              const gateLeft = [!org.gate.contractorTerms && "terms", !org.gate.classificationReview && "classification", !org.gate.legalContact && "legal contact"].filter(Boolean);
              return (
                <li key={org.id}>
                  <Link transitionTypes={["nav-forward"]} href={`/admin/organizations/${org.id}`} className="block space-y-1 px-4 py-3 transition hover:bg-surface-2">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="font-semibold text-fg">{org.name}</span>
                      <span className="text-xs text-subtle">
                        {org.approvedAt ? <>Withdrawn; last approved <LocalTime iso={org.approvedAt.toISOString()} mode="fulldate" /></> : <>Signed up <LocalTime iso={org.createdAt.toISOString()} mode="fulldate" /></>}
                      </span>
                    </span>
                    <span className="block break-words text-sm text-muted">
                      {owner ? <>Owner {owner.name ?? owner.email ?? "without a login"}</> : "No owner yet"}
                      {" · "}{org.members} {org.members === 1 ? "member" : "members"}
                      {" · "}{gateLeft.length ? `gate missing ${gateLeft.join(", ")}` : "gate complete"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="rules-attention">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="rules-attention" className="section-title">Jurisdiction rules that need attention</h2>
          <Link transitionTypes={["nav-forward"]} href="/admin/jurisdictions" className="link text-sm font-medium">All rule profiles</Link>
        </div>
        <p className="text-muted-sm">A job can&apos;t publish under a rule profile that is unapproved, expired or not yet effective. Listed here: profiles in force that fail that test now, then any whose approval ends within {EXPIRY_WINDOW_DAYS} days.</p>
        {attention.length === 0 ? (
          <p className="text-muted-sm">Every rule profile in force is usable, and none expires within {EXPIRY_WINDOW_DAYS} days.</p>
        ) : (
          <ul className="list-card">
            {attention.map((row) => { const { v } = row; return (
              <li key={v.id}>
                <Link transitionTypes={["nav-forward"]} href={`/admin/jurisdictions/${v.id}`} className="block space-y-1 px-4 py-3 transition hover:bg-surface-2">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-semibold text-fg">{placeName(v)} · version {v.version}</span>
                    <span className="text-xs text-subtle">{v.jobs} open {v.jobs === 1 ? "job" : "jobs"}</span>
                  </span>
                  {row.blocked ? (
                    <span className="block text-sm text-warning-msg">Can&apos;t be used to publish: {v.problems[0]}{v.problems.length > 1 ? ` (+${v.problems.length - 1} more)` : ""}</span>
                  ) : (
                    <span className="block text-sm text-muted">Approval ends <LocalTime iso={row.expiresAt.toISOString()} mode="fulldate" /></span>
                  )}
                </Link>
              </li>
            ); })}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="recent-acts">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="recent-acts" className="section-title">Recent staff actions</h2>
          <Link transitionTypes={["nav-forward"]} href="/admin/audit" className="link text-sm font-medium">Audit timeline</Link>
        </div>
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
                  <span className="break-all font-mono text-sm text-fg">{a.action}</span>
                  <span className="text-xs text-subtle"><LocalTime iso={a.createdAt.toISOString()} mode="full" /></span>
                </p>
                <p className="text-sm text-muted">
                  {a.staffName}
                  {a.orgName ? <> · {a.orgName}</> : null} · {a.targetType} <span className="font-mono text-xs">{a.targetId.slice(0, 8)}</span>
                </p>
                <p className="break-words text-sm text-fg">{a.reason}</p>
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
