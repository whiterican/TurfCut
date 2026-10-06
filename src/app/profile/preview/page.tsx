import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { loadScorecardPeriods } from "@/lib/scorecard-data";
import { loadSharing } from "@/lib/sharing-data";
import { loadAvailability } from "@/lib/availability-data";
import { loadCredentials } from "@/lib/credentials-data";
import { loadLatestPreference } from "@/lib/political-fit-data";
import { effectivePreference, employerFitView } from "@/lib/political-fit";
import { visibleParts, type Viewer } from "@/lib/sharing";
import { shareScorecardPeriodsForOrg } from "@/lib/shared-scorecard";
import { availabilitySummary, isEmptyAvailability } from "@/lib/availability";
import { ScorecardPanel } from "@/components/ScorecardPanel";
import { AvailabilityStatement } from "@/components/AvailabilityStatement";
import { CredentialList } from "@/components/CredentialList";
import { FitSignals } from "@/components/FitSignals";

const TABS = [
  { key: "applied", label: "An organization you applied to", viewer: { kind: "org", approved: true, relationship: true } },
  { key: "approved", label: "An organization that could hire you", viewer: { kind: "org", approved: true, relationship: false } },
  { key: "public", label: "The public", viewer: { kind: "public" } },
] as const satisfies ReadonlyArray<{ key: string; label: string; viewer: Viewer }>;

/**
 * Profile → See what organizations see (C2.6). Each tab is drawn by the same
 * rules (visibleParts, shareScorecard, employerFitView) and the same
 * components the organization's worker page uses, so the preview can't drift
 * from the real view.
 */
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { workerId } = await requireWorker();
  const as = (await searchParams).as;
  const tab = TABS.find((t) => t.key === as) ?? TABS[0];
  const [periods, sharing, avail, creds, pref] = await Promise.all([
    loadScorecardPeriods(workerId),
    loadSharing(workerId),
    loadAvailability(workerId),
    loadCredentials(workerId),
    loadLatestPreference(workerId),
  ]);
  const parts = visibleParts(sharing.choices, tab.viewer);
  const today = new Date().toISOString().slice(0, 10);
  const shared = shareScorecardPeriodsForOrg(periods, parts);
  const isOrg = tab.viewer.kind === "org";

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
          {tab.key === "approved"
            ? "Today no organization reaches you without your applying or accepting an invite; this shows what one would see once that's possible."
            : tab.key === "public"
              ? "Turfcut has no public profiles: nobody outside an organization sees anything."
              : "What an organization sees after you apply to one of its jobs or accept its invite."}{" "}
          <Link href="/profile/sharing" className="link">Change who sees what</Link>
        </p>
      </header>

      {!isOrg ? (
        <div className="empty-state">
          <p className="empty-state-title">Nothing is shown</p>
          <p className="empty-state-body">Your scorecard, availability, credentials and political-fit answers are never public.</p>
        </div>
      ) : (
        <>
          <section className="section">
            <h2 className="section-title">Scorecard</h2>
            <ScorecardPanel periods={shared} />
          </section>
          <section className="section">
            <h2 className="section-title">Availability</h2>
            <div className="card">
              <AvailabilityStatement view={!parts.availability ? "withheld" : isEmptyAvailability(avail.availability) ? null : availabilitySummary(avail.availability, today)} />
            </div>
          </section>
          <section className="section">
            <h2 className="section-title">Credentials</h2>
            <div className="card">
              <CredentialList view={!parts.credentials ? "withheld" : creds.map((c) => ({ kind: c.kind, label: c.label, state: c.state, verification: c.verification, expiresOn: c.expiresOn }))} today={today} />
            </div>
          </section>
          <section className="section">
            <h2 className="section-title">Political fit</h2>
            <FitSignals view={employerFitView(effectivePreference(pref), { orgHasRelationship: tab.viewer.kind === "org" && tab.viewer.relationship, campaign: null })} />
          </section>
        </>
      )}
    </main>
  );
}
