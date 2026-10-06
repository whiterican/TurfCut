import Link from "next/link";
import { db } from "@/lib/db";
import { requireWorker } from "@/lib/worker-session";
import { loadCampaignHistory, loadScorecardPeriods } from "@/lib/scorecard-data";
import { loadLatestPreference } from "@/lib/political-fit-data";
import { VISIBILITY_OPTIONS } from "@/lib/political-fit";
import { ExperienceForm } from "@/components/ExperienceForm";
import { ExperienceList } from "@/components/ExperienceList";
import { ScorecardPanel } from "@/components/ScorecardPanel";
import { ALL_SHARED, shareScorecardPeriods } from "@/lib/shared-scorecard";
import { removeExperience } from "./actions";
import { PhoneForm } from "@/components/PhoneForm";
import { loadSharing } from "@/lib/sharing-data";
import { loadAvailability } from "@/lib/availability-data";
import { availabilitySummary, isEmptyAvailability } from "@/lib/availability";
import { AvailabilityStatement } from "@/components/AvailabilityStatement";
import { loadCredentials } from "@/lib/credentials-data";
import { CredentialList } from "@/components/CredentialList";
import { expiryToday } from "@/lib/credentials";
import { PART_DETAILS, SHARE_PARTS, type ShareAudience } from "@/lib/sharing";

const AUDIENCE_SHORT: Record<ShareAudience, string> = {
  RELATIONSHIP: "Organizations you apply to",
  ANY_APPROVED_ORG: "Any approved organization",
  NOBODY: "Nobody",
};

export default async function ProfilePage() {
  const { workerId } = await requireWorker();
  const [worker, records, scorecard, fit, history, sharing, avail, creds] = await Promise.all([
    db().worker.findUniqueOrThrow({ where: { id: workerId }, select: { displayName: true, phone: true } }),
    db().experienceRecord.findMany({ where: { workerId }, orderBy: { startDate: "desc" } }),
    loadScorecardPeriods(workerId),
    loadLatestPreference(workerId),
    loadCampaignHistory(workerId),
    loadSharing(workerId),
    loadAvailability(workerId),
    loadCredentials(workerId),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const mode = fit && VISIBILITY_OPTIONS.find((o) => o.value === fit.visibilityMode);

  return (
    <main className="page">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Your profile</p>
          <h1 className="page-title">{worker.displayName}</h1>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link transitionTypes={["nav-forward"]} href="/earnings" className="btn-secondary btn-sm">Earnings</Link>
          <Link href="/settings" className="btn-ghost btn-sm">Settings &amp; sign out</Link>
        </div>
      </header>

      {sharing.version === null && (
        // Until the worker saves a sharing choice (C2-Q4): a reminder, every visit.
        <section className="card space-y-2" aria-label="Set up who sees what">
          <p className="font-semibold text-fg">Choose who sees what</p>
          <p className="text-muted-sm">You&apos;re on the defaults: organizations you apply to or accept an invite from see your profile, and nobody can find you.</p>
          <div className="flex flex-wrap gap-2">
            <Link transitionTypes={["nav-forward"]} href="/profile/setup" className="btn-primary btn-sm">Set it up</Link>
            <Link href="/profile/preview" className="btn-ghost btn-sm">See what organizations see</Link>
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Scorecard</h2>
        <ScorecardPanel periods={shareScorecardPeriods(scorecard, ALL_SHARED)} history={history} />
      </section>

      <section className="section">
        <h2 className="section-title">Experience</h2>
        <ExperienceList
          records={records.map((r) => ({ ...r, hasReference: r.referenceContact !== null }))}
          removeAction={removeExperience}
          showReference
        />
        <details className="card group" open={records.length === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium text-fg">
            <span className="flex items-center gap-2">
              <span aria-hidden className="dot bg-success" />
              Add a campaign
            </span>
            <span aria-hidden className="text-subtle transition group-open:rotate-45">+</span>
          </summary>
          <div className="mt-5 border-t border-border pt-5">
            <ExperienceForm />
          </div>
        </details>
      </section>

      <section className="section">
        <h2 className="section-title">Availability</h2>
        <div className="card space-y-3">
          <AvailabilityStatement view={isEmptyAvailability(avail.availability) ? null : availabilitySummary(avail.availability, today)} />
          <Link transitionTypes={["nav-forward"]} href="/profile/availability" className="btn-secondary">
            {avail.version === null ? "Set your availability" : "Change availability"}
          </Link>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Credentials</h2>
        <div className="card space-y-3">
          <CredentialList view={creds.map((c) => ({ kind: c.kind, label: c.label, state: c.state, verification: c.verification, expiresOn: c.expiresOn }))} today={expiryToday()} />
          <Link transitionTypes={["nav-forward"]} href="/profile/credentials" className="btn-secondary">
            {creds.length ? "Manage credentials" : "Add a credential"}
          </Link>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Who sees what</h2>
        <div className="card space-y-3">
          <ul className="space-y-1.5">
            {SHARE_PARTS.map((part) => (
              <li key={part} className="flex flex-wrap justify-between gap-x-4 text-sm">
                <span className="text-fg">{PART_DETAILS[part].label}</span>
                <span className="text-muted">{AUDIENCE_SHORT[sharing.choices.audiences[part]]}</span>
              </li>
            ))}
            <li className="flex flex-wrap justify-between gap-x-4 text-sm">
              <span className="text-fg">Organizations can find you</span>
              <span className="text-muted">{sharing.choices.findable ? `Yes, within ${sharing.choices.travelMiles} miles of ${sharing.choices.homeArea}` : "No"}</span>
            </li>
          </ul>
          {sharing.version === null && <p className="text-hint">These are the defaults. Nothing changes until you choose.</p>}
          <div className="flex flex-wrap gap-2">
            <Link transitionTypes={["nav-forward"]} href="/profile/sharing" className="btn-secondary">Change who sees what</Link>
            <Link transitionTypes={["nav-forward"]} href="/profile/preview" className="btn-ghost">See what organizations see</Link>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Political fit</h2>
        <div className="card space-y-3">
          {mode ? (
            <>
              <div className="space-y-1">
                <span className="badge-accent">{mode.label}</span>
                <p className="text-muted-sm">{mode.description}</p>
              </div>
              <p className="text-hint">
                Consent version {fit.consentVersion}, given {fit.consentedAt.toISOString().slice(0, 10)}
                {fit.status.state === "current" &&
                  (fit.status.expiresAt ? `, expires ${fit.status.expiresAt.toISOString().slice(0, 10)}` : ", no expiry")}
                .
              </p>
              {fit.status.state !== "current" && (
                <p role="status" className="alert-warning">
                  Needs reconfirming — until then nothing is used for matching or shown to organizations.
                </p>
              )}
            </>
          ) : (
            <div className="space-y-1">
              <p className="font-medium text-fg">Not set yet</p>
              <p className="text-muted-sm">Until you choose, nothing is used for matching or shown to anyone.</p>
            </div>
          )}
          <Link href="/profile/preferences" className={mode ? "btn-secondary" : "btn-primary"}>
            {mode ? "Review or change" : "Set preferences"}
          </Link>
        </div>
      </section>
      <section className="section">
        <h2 className="section-title">Contact</h2>
        <PhoneForm phone={worker.phone} />
      </section>
    </main>
  );
}
