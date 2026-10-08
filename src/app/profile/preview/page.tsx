import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorker } from "@/lib/worker-session";
import { previewOrgProfile } from "@/lib/org-profile-data";
import type { OrgOrPublic } from "@/lib/org-profile";
import { OrgProfileSections } from "@/components/OrgProfileSections";

const TABS = [
  { key: "applied", label: "An organization you applied to", viewer: { kind: "org", approved: true, relationship: true } },
  { key: "approved", label: "Any approved organization", viewer: { kind: "org", approved: true, relationship: false } },
  { key: "public", label: "The public", viewer: { kind: "public" } },
] as const satisfies ReadonlyArray<{ key: string; label: string; viewer: OrgOrPublic }>;

const HINTS: Record<(typeof TABS)[number]["key"], string> = {
  applied:
    "What an organization sees after you apply to one of its jobs or accept its invite: your name and the parts of your profile you share with it (your experience goes with hours and history). Each application also keeps a copy of what you shared at that moment, including where your shared issue positions agree with that campaign's.",
  approved: "Today no organization reaches you without your applying or accepting an invite; this shows what any approved organization would see once that's possible.",
  public: "Nobody outside an approved organization you've applied to (or chosen to share with) sees your profile.",
};

/**
 * Profile → See what organizations see (C2.6). Each organization tab is the
 * organization's own worker page, built by the same function from the same
 * data (orgProfileView) and drawn by the same component, for an imagined
 * viewer, so the preview can't drift from the real view.
 */
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { workerId } = await requireWorker();
  const as = (await searchParams).as;
  const tab = TABS.find((t) => t.key === as) ?? TABS[0];
  const view = tab.viewer.kind === "org" ? await previewOrgProfile(workerId, tab.viewer) : null;
  if (tab.viewer.kind === "org" && !view) notFound();

  return (
    <main className="page space-y-8">
      <header className="space-y-3">
        <div className="page-header">
          <h1 className="page-title">See what organizations see</h1>
          <Link transitionTypes={["nav-back"]} href="/profile" className="btn-ghost">← Profile</Link>
        </div>
        <nav aria-label="Viewer" className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link key={t.key} href={`/profile/preview?as=${t.key}`} className="chip" aria-current={t.key === tab.key ? "page" : undefined} replace scroll={false}>
              {t.label}
            </Link>
          ))}
        </nav>
        <p className="text-hint">
          {HINTS[tab.key]} <Link href="/profile/sharing" className="link">Change who sees what</Link>
        </p>
      </header>

      {!view ? (
        <div className="empty-state">
          <p className="empty-state-title">Nothing is shown</p>
          <p className="empty-state-body">Your name, scorecard, experience, availability, credentials and political-fit answers are never public.</p>
        </div>
      ) : (
        <section aria-label="Your profile as this organization sees it" className="space-y-8 border-t border-border pt-6">
          <div className="space-y-1">
            <p className="eyebrow">Worker profile</p>
            <p className="page-title">{view.displayName}</p>
          </div>
          <OrgProfileSections view={view} />
        </section>
      )}
    </main>
  );
}
