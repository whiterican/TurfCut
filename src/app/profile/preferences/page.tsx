import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { CONSENT_TEXT, loadLatestPreference } from "@/lib/political-fit-data";
import { PreferencesFlow } from "@/components/PreferencesFlow";

export default async function PreferencesPage() {
  const { workerId } = await requireWorker();
  const latest = await loadLatestPreference(workerId);

  return (
    <main className="page max-w-2xl space-y-8">
      <header className="space-y-3">
        <div className="page-header">
          <h1 className="page-title">Political-fit preferences</h1>
          <Link href="/profile" className="btn-ghost">← Profile</Link>
        </div>
        <p className="lead">
          Every answer here is optional and comes only from you. Turfcut never
          guesses your politics from anything else. Nothing is saved until you
          consent on the last step.
        </p>
        {latest && (
          <p className="text-hint">
            Current: consent version {latest.consentVersion}, given{" "}
            {latest.consentedAt.toISOString().slice(0, 10)}
            {latest.status.state === "current" &&
              (latest.status.expiresAt
                ? `, expires ${latest.status.expiresAt.toISOString().slice(0, 10)}`
                : ", no expiry")}
            . Saving changes creates version {latest.consentVersion + 1}.
          </p>
        )}
        {latest && latest.status.state !== "current" && (
          <p role="status" className="alert-warning">
            {latest.status.state === "expired"
              ? `Your consent expired on ${latest.status.expiredAt.toISOString().slice(0, 10)}.`
              : "Your saved answers were given under earlier consent wording."}{" "}
            Until you review and reconfirm below, your answers aren&apos;t used for
            matching and organizations see &quot;not shared&quot;.
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
