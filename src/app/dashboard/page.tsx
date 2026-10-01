import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

const ROLE_LABELS: Record<string, string> = {
  WORKER: "Field worker",
  OWNER: "Organization owner",
  RECRUITER: "Recruiter",
  COMPLIANCE: "Compliance",
  SUPERVISOR: "Supervisor",
  FINANCE: "Finance",
};

function NavCard({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="card group block transition hover:border-[var(--border-strong)]">
      <p className="flex items-center justify-between font-medium text-fg">
        {title}
        <span aria-hidden className="text-subtle transition group-hover:translate-x-0.5">→</span>
      </p>
      <p className="text-muted-sm mt-1">{body}</p>
    </Link>
  );
}

export default async function DashboardPage() {
  const session = await requireAuth();

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  const hasLinks = session.role === "WORKER" || !!session.orgId;
  const canHire = session.role === "OWNER" || session.role === "RECRUITER";

  return (
    <main className="page">
      <header className="page-header">
        <div className="space-y-2">
          <span className="badge-lavender">{ROLE_LABELS[session.role] ?? session.role}</span>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-muted-sm">
            Signed in as <span className="font-medium text-fg">{session.email}</span>
          </p>
        </div>
        <form action={signOut}>
          <button type="submit" className="btn-secondary">
            Sign out
          </button>
        </form>
      </header>

      {hasLinks ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {session.role === "WORKER" && (
            <>
              <NavCard href="/jobs" title="Find work" body="Open jobs, with pay, credentials and who to call — up front." />
              <NavCard href="/profile" title="My profile" body="Your scorecard, experience and political-fit status." />
              <NavCard
                href="/profile/preferences"
                title="Political-fit preferences"
                body="Choose what, if anything, organizations may see."
              />
            </>
          )}
          {session.role !== "WORKER" && session.orgId && (
            <NavCard href="/jobs" title="Jobs" body={canHire ? "Build, publish and staff your jobs." : "Your organization's jobs."} />
          )}
          {canHire && (
            <NavCard href="/workers" title="Browse workers" body="Verified scorecards and experience, listed alphabetically." />
          )}
          {session.role !== "WORKER" && session.orgId && (
            <NavCard href="/org/settings" title="Organization settings" body="Publishing checks, legal contact and jurisdiction rules." />
          )}
        </div>
      ) : (
        <div className="empty-state">
          <p className="empty-state-title">Nothing here yet</p>
          <p className="empty-state-body">Tools for your role arrive in upcoming milestones.</p>
        </div>
      )}

      <footer className="space-y-1">
        {session.orgId && <p className="text-hint">Org ID: {session.orgId}</p>}
        <p className="text-hint">
          M2: jobs, the publish gate, applications, invitations and claims. Matching lands in M3.
        </p>
      </footer>
    </main>
  );
}
