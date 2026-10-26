import Link from "next/link";
import { notFound } from "next/navigation";
import { workerAccessFor } from "@/lib/worker-access-data";
import { requireEmployer } from "@/lib/employer-session";
import { loadOrgProfile } from "@/lib/org-profile-data";
import { OrgProfileSections } from "@/components/OrgProfileSections";
import { InviteComposer } from "@/components/InviteComposer";
import { Masthead } from "@/components/Masthead";

/** A worker as an organization sees them: only what the worker authorized. */
export default async function EmployerWorkerPage({
  params,
}: {
  params: Promise<{ workerId: string }>;
}) {
  const { workerId } = await params;
  const session = await requireEmployer();
  const access = await workerAccessFor(session, workerId, session.orgApproved);
  if (access.kind !== "employer") {
    return (
      <main className="page max-w-2xl">
        <div className="empty-state">
          <p className="empty-state-title">This profile isn&apos;t available</p>
          <p className="empty-state-body">{access.kind === "denied" ? access.reason : "Not available."}</p>
        </div>
      </main>
    );
  }

  // The same view the worker previews (C2.6): only what they share with this organization, right now.
  const view = await loadOrgProfile(workerId, access.orgId);
  if (!view) notFound();

  return (
    <main className="page">
      {/* Only the display name — no phone or other contact details. (No name for an unapproved viewer, which can't reach here today.) */}
      <Masthead eyebrow="Worker profile" title={view.displayName ?? "Name not shared"}>
        <Link transitionTypes={["nav-back"]} href="/jobs" className="btn-ghost">← Jobs</Link>
      </Masthead>

      <InviteComposer workerId={workerId} orgId={access.orgId} />

      <OrgProfileSections view={view} />
    </main>
  );
}
