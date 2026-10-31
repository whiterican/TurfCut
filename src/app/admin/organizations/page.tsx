import { StatusChip } from "@/components/StatusBadge";
import Link from "next/link";
import { requireStaff } from "@/lib/staff-session";
import { approvalStanding, listOrganizationsForAdmin, type AdminOrgRow } from "@/lib/admin-orgs-data";
import { LocalTime } from "@/components/LocalTime";

function GateChips({ gate }: { gate: AdminOrgRow["gate"] }) {
  const items: Array<[string, boolean]> = [["Terms", gate.contractorTerms], ["Classification", gate.classificationReview], ["Legal contact", gate.legalContact]];
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map(([label, done]) => (
        <StatusChip key={label} state={done ? "approved" : "pending"} label={`${label}${done ? "" : " · not yet"}`} />
      ))}
    </span>
  );
}

function OrgRow({ o }: { o: AdminOrgRow }) {
  return (
    <li>
      <Link transitionTypes={["nav-forward"]} href={`/admin/organizations/${o.id}`} className="block space-y-2 px-4 py-3 transition hover:bg-surface-2">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="flex flex-wrap items-center gap-2 font-semibold text-fg">
            {o.name}
            {approvalStanding(o) === "withdrawn" && <StatusChip state="blocked" label="Approval withdrawn" />}
          </span>
          <span className="text-xs text-subtle">
            {o.approved && o.approvedAt ? (
              <>Approved <LocalTime iso={o.approvedAt.toISOString()} mode="fulldate" /></>
            ) : !o.approved && o.approvedAt ? (
              <>Withdrawn; last approved <LocalTime iso={o.approvedAt.toISOString()} mode="fulldate" /></>
            ) : (
              <>Signed up <LocalTime iso={o.createdAt.toISOString()} mode="fulldate" /></>
            )}
          </span>
        </span>
        <span className="block text-sm text-muted">
          {o.members} {o.members === 1 ? "member" : "members"} · {o.owners[0] ? (o.owners[0].email ?? o.owners[0].name ?? "owner without a login") : "no owner yet"}{o.owners.length > 1 ? ` +${o.owners.length - 1}` : ""} · {o.jobs.draft} draft, {o.jobs.published} published
        </span>
        <GateChips gate={o.gate} />
      </Link>
    </li>
  );
}

/** The organization approval queue (M10.2): who is waiting for the pilot, and who is in. */
export default async function AdminOrganizationsPage() {
  await requireStaff();
  const { awaiting, approved } = await listOrganizationsForAdmin();
  return (
    <>
      <section className="section" aria-labelledby="awaiting">
        <h2 id="awaiting" className="section-title flex items-center justify-between">
          Awaiting approval <span className="text-xs font-medium text-subtle">{awaiting.length}</span>
        </h2>
        <p className="text-muted-sm">Waiting longest first. Approval lets an organization see worker profiles, publish once its gate is complete, and be found by workers.</p>
        {awaiting.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">Nothing waiting</p>
            <p className="empty-state-body">A new organization lands here the moment someone signs it up.</p>
          </div>
        ) : (
          <ul className="list-card">{awaiting.map((o) => <OrgRow key={o.id} o={o} />)}</ul>
        )}
      </section>

      <section className="section" aria-labelledby="approved">
        <h2 id="approved" className="section-title flex items-center justify-between">
          Approved <span className="text-xs font-medium text-subtle">{approved.length}</span>
        </h2>
        {approved.length === 0 ? (
          <p className="text-muted-sm">No organization is approved yet.</p>
        ) : (
          <ul className="list-card">{approved.map((o) => <OrgRow key={o.id} o={o} />)}</ul>
        )}
      </section>
    </>
  );
}
