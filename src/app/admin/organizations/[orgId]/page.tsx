import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/staff-session";
import { approvalStanding, loadOrganizationForAdmin } from "@/lib/admin-orgs-data";
import { OrgDecisionForm } from "@/components/admin/OrgDecisionForm";
import { LocalTime } from "@/components/LocalTime";

function GateItem({ label, done, detail }: { label: string; done: boolean; detail: string }) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <span className="space-y-0.5">
        <span className="block text-sm font-semibold text-fg">{label}</span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
      <span className={done ? "badge-solid" : "badge-neutral"}>{done ? "Done" : "Not yet"}</span>
    </li>
  );
}

/** One organization in the queue (M10.2): its gate, its owners, its jobs, Turfcut's decisions so far, and the decision form. */
export default async function AdminOrganizationPage({ params }: { params: Promise<{ orgId: string }> }) {
  await requireStaff();
  const { orgId } = await params;
  const org = await loadOrganizationForAdmin(orgId);
  if (!org) notFound();
  const standing = approvalStanding(org);
  return (
    <>
      <p>
        <Link transitionTypes={["nav-back"]} href="/admin/organizations" className="link text-sm">All organizations</Link>
      </p>
      <header className="space-y-2">
        <h2 className="page-title">{org.name}</h2>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {standing === "approved" && <span className="badge-solid">Approved</span>}
          {standing === "awaiting" && <span className="badge-butter">Awaiting approval</span>}
          {standing === "withdrawn" && <span className="badge-coral">Approval withdrawn</span>}
          <span>Signed up <LocalTime iso={org.createdAt.toISOString()} mode="fulldate" /></span>
          {org.approvedAt && <span>· {standing === "approved" ? "approved" : "last approved"} <LocalTime iso={org.approvedAt.toISOString()} mode="fulldate" /></span>}
        </p>
      </header>

      <section className="section" aria-labelledby="gate">
        <h3 id="gate" className="section-title">Publish gate</h3>
        <p className="text-muted-sm">Approval is Turfcut&apos;s part. The organization records the rest itself; no job publishes until all of it is done.</p>
        <ul className="list-card">
          <GateItem label="Turfcut approval" done={org.approved} detail="Set below." />
          <GateItem label="Contractor terms" done={org.gate.contractorTerms} detail="Signed by the organization in its settings." />
          <GateItem label="Worker-classification review" done={org.gate.classificationReview} detail="Recorded by the organization's owner or compliance seat." />
          <GateItem label="Legal contact" done={org.gate.legalContact} detail="Who counsel reaches about this organization." />
        </ul>
      </section>

      <section className="section" aria-labelledby="owners">
        <h3 id="owners" className="section-title">Owners and activity</h3>
        {org.owners.length === 0 ? (
          <p className="text-muted-sm">No owner login yet.</p>
        ) : (
          <ul className="list-card">
            {org.owners.map((w) => (
              <li key={w.profileId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3">
                <span className="text-sm font-semibold text-fg">{w.name ?? "Owner"}{w.email ? <span className="font-normal text-muted"> · {w.email}</span> : null}</span>
                <span className="text-xs text-subtle">since <LocalTime iso={w.since.toISOString()} mode="fulldate" /></span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-sm">
          {org.members} {org.members === 1 ? "member" : "members"} · {org.jobs.draft} draft, {org.jobs.published} published, {org.jobs.other} paused or closed {org.jobs.draft + org.jobs.published + org.jobs.other === 1 ? "job" : "jobs"}
        </p>
      </section>

      <section className="section" aria-labelledby="decision">
        <h3 id="decision" className="section-title">{standing === "approved" ? "Withdraw approval" : "Approve"}</h3>
        <OrgDecisionForm orgId={org.id} approved={org.approved} />
      </section>

      <section className="section" aria-labelledby="history">
        <h3 id="history" className="section-title">Turfcut&apos;s decisions on this organization</h3>
        {org.history.length === 0 ? (
          <p className="text-muted-sm">None yet.</p>
        ) : (
          <ul className="list-card">
            {org.history.map((h) => (
              <li key={h.id} className="space-y-1 px-4 py-3">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold text-fg">{h.action === "org.approved" ? "Approved" : h.action === "org.approval_revoked" ? "Approval withdrawn" : h.action}</span>
                  <span className="text-xs text-subtle"><LocalTime iso={h.createdAt.toISOString()} mode="full" /></span>
                </p>
                <p className="text-sm text-muted">{h.staffName}</p>
                <p className="text-sm text-fg">{h.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
