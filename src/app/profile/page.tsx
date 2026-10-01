import Link from "next/link";
import { db } from "@/lib/db";
import { requireWorker } from "@/lib/worker-session";
import { loadCampaignHistory, loadScorecardPeriods } from "@/lib/scorecard-data";
import { loadLatestPreference } from "@/lib/political-fit-data";
import { VISIBILITY_OPTIONS } from "@/lib/political-fit";
import { ExperienceForm } from "@/components/ExperienceForm";
import { ExperienceList } from "@/components/ExperienceList";
import { ScorecardPanel } from "@/components/ScorecardPanel";
import { removeExperience } from "./actions";
import { PhoneForm } from "@/components/PhoneForm";

export default async function ProfilePage() {
  const { workerId } = await requireWorker();
  const [worker, records, scorecard, fit, history] = await Promise.all([
    db().worker.findUniqueOrThrow({ where: { id: workerId }, select: { displayName: true, phone: true } }),
    db().experienceRecord.findMany({ where: { workerId }, orderBy: { startDate: "desc" } }),
    loadScorecardPeriods(workerId),
    loadLatestPreference(workerId),
    loadCampaignHistory(workerId),
  ]);
  const mode = fit && VISIBILITY_OPTIONS.find((o) => o.value === fit.visibilityMode);

  return (
    <main className="page">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Your profile</p>
          <h1 className="page-title">{worker.displayName}</h1>
        </div>
        <Link href="/settings" className="btn-ghost btn-sm">Settings &amp; sign out</Link>
      </header>

      <section className="section">
        <h2 className="section-title">Scorecard</h2>
        <ScorecardPanel periods={scorecard} history={history} />
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
              <span aria-hidden className="dot bg-mint" />
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
        <h2 className="section-title">Political fit</h2>
        <div className="card space-y-3">
          {mode ? (
            <>
              <div className="space-y-1">
                <span className="badge-lime">{mode.label}</span>
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
