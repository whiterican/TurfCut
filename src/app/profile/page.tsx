import Link from "next/link";
import { db } from "@/lib/db";
import { requireWorker } from "@/lib/worker-session";
import { loadScorecardPeriods } from "@/lib/scorecard-data";
import { loadLatestPreference } from "@/lib/political-fit-data";
import { VISIBILITY_OPTIONS } from "@/lib/political-fit";
import { ExperienceForm } from "@/components/ExperienceForm";
import { ExperienceList } from "@/components/ExperienceList";
import { ScorecardPanel } from "@/components/ScorecardPanel";
import { removeExperience } from "./actions";

export default async function ProfilePage() {
  const { workerId } = await requireWorker();
  const [worker, records, scorecard, fit] = await Promise.all([
    db().worker.findUniqueOrThrow({ where: { id: workerId }, select: { displayName: true } }),
    db().experienceRecord.findMany({ where: { workerId }, orderBy: { startDate: "desc" } }),
    loadScorecardPeriods(workerId),
    loadLatestPreference(workerId),
  ]);
  const mode = fit && VISIBILITY_OPTIONS.find((o) => o.value === fit.visibilityMode);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-10 px-4 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">{worker.displayName}</h1>
        <Link href="/dashboard" className="text-sm underline">Dashboard</Link>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Scorecard</h2>
        <ScorecardPanel periods={scorecard} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Experience</h2>
        <ExperienceList records={records} removeAction={removeExperience} />
        <details className="rounded-lg border p-4" open={records.length === 0}>
          <summary className="cursor-pointer font-medium">Add a campaign</summary>
          <div className="pt-4">
            <ExperienceForm />
          </div>
        </details>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Political fit</h2>
        <div className="rounded-lg border p-3 text-sm">
          {mode ? (
            <>
              <p className="font-medium">{mode.label}</p>
              <p className="text-neutral-600 dark:text-neutral-400">{mode.description}</p>
              <p className="mt-1 text-xs text-neutral-500">
                Consent version {fit.consentVersion}, given {fit.consentedAt.toISOString().slice(0, 10)}.
              </p>
            </>
          ) : (
            <p>Not set. Until you choose, nothing is used for matching or shown to anyone.</p>
          )}
          <Link href="/profile/preferences" className="mt-2 inline-block underline">
            {mode ? "Review or change" : "Set preferences"}
          </Link>
        </div>
      </section>
    </main>
  );
}
