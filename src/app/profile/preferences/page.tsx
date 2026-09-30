import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { CONSENT_TEXT, loadLatestPreference } from "@/lib/political-fit-data";
import { PreferencesFlow } from "@/components/PreferencesFlow";

export default async function PreferencesPage() {
  const { workerId } = await requireWorker();
  const latest = await loadLatestPreference(workerId);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">Political-fit preferences</h1>
          <Link href="/profile" className="text-sm underline">Back to profile</Link>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Every answer here is optional and comes only from you. Turfcut never
          guesses your politics from anything else. Nothing is saved until you
          consent on the last step.
        </p>
        {latest && (
          <p className="text-xs text-neutral-500">
            Current: consent version {latest.consentVersion}, given{" "}
            {latest.consentedAt.toISOString().slice(0, 10)}. Saving changes
            creates version {latest.consentVersion + 1}.
          </p>
        )}
      </header>
      <PreferencesFlow
        initial={latest ? {
          visibilityMode: latest.visibilityMode,
          identityLabels: latest.identityLabels,
          partyRelationship: latest.partyRelationship,
          issuePositions: latest.issuePositions,
          campaignBoundaries: latest.campaignBoundaries,
        } : null}
        consentText={CONSENT_TEXT}
      />
    </main>
  );
}
