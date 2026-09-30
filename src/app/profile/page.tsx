import Link from "next/link";
import { db } from "@/lib/db";
import { requireWorker } from "@/lib/worker-session";
import { loadScorecard } from "@/lib/scorecard-data";
import { ExperienceForm } from "@/components/ExperienceForm";
import { ExperienceList } from "@/components/ExperienceList";
import { ScorecardPanel } from "@/components/ScorecardPanel";
import { removeExperience } from "./actions";

export default async function ProfilePage() {
  const { workerId } = await requireWorker();
  const [worker, records, scorecard] = await Promise.all([
    db().worker.findUniqueOrThrow({ where: { id: workerId }, select: { displayName: true } }),
    db().experienceRecord.findMany({ where: { workerId }, orderBy: { startDate: "desc" } }),
    loadScorecard(workerId),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-10 px-4 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">{worker.displayName}</h1>
        <Link href="/dashboard" className="text-sm underline">Dashboard</Link>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Scorecard</h2>
        <ScorecardPanel scorecard={scorecard} />
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
    </main>
  );
}
