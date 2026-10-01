import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { CONSENT_TEXT, loadLatestPreference } from "@/lib/political-fit-data";
import { PreferencesFlow } from "@/components/PreferencesFlow";

const dateText = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function PreferencesPage() {
  const { workerId } = await requireWorker();
  const latest = await loadLatestPreference(workerId);

  return (
    <main className="page max-w-2xl space-y-8">
      <header className="space-y-3">
        <div className="page-header">
          <h1 className="page-title">Political-fit preferences</h1>
          <Link transitionTypes={["nav-back"]} href="/profile" className="btn-ghost">← Profile</Link>
        </div>
        <p className="lead">
          Every answer here is optional and comes only from you. Turfcut never
          guesses your politics from anything else. Nothing is saved until you
          consent on the last step.
        </p>
        {latest && (
          <p className="text-hint">
            You last saved your answers on {dateText(latest.consentedAt)}
            {latest.status.state === "current" &&
              (latest.status.expiresAt ? `. They're used until ${dateText(latest.status.expiresAt)}, unless you change them` : ". They're used until you change them")}
            . If you change anything, your earlier answers are kept on record, never overwritten.
            <span className="mt-1 block">Record no. {latest.consentVersion} — organizations see this number next to anything they were shown.</span>
          </p>
        )}
        {latest && latest.status.state !== "current" && (
          <p role="status" className="alert-warning">
            {latest.status.state === "expired"
              ? `Your permission to use these answers ran out on ${dateText(latest.status.expiredAt)}.`
              : "We've updated the wording of what you agree to since you last saved."}{" "}
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
