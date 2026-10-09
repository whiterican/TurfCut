import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { loadSharing } from "@/lib/sharing-data";
import { RELATIONSHIP_PHRASE } from "@/lib/sharing";
import { SharingForm } from "@/components/SharingForm";

const dateText = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function SharingPage() {
  const { workerId } = await requireWorker();
  const sharing = await loadSharing(workerId);

  return (
    <main className="page max-w-2xl space-y-8">
      <header className="space-y-3">
        <div className="page-header">
          <h1 className="page-title">Who sees what</h1>
          <Link transitionTypes={["nav-back"]} href="/profile" className="btn-ghost">← Profile</Link>
        </div>
        <p className="lead">
          Choose who sees each part of your profile. Anything you don&apos;t share shows as
          &quot;not shared&quot; to organizations, never as a zero, and is never used to rank you.
        </p>
        <p className="text-hint">
          {sharing.savedAt
            ? `You last changed these on ${dateText(sharing.savedAt)}. Earlier choices are kept on record, never overwritten.`
            : `You haven't changed anything yet: organizations you ${RELATIONSHIP_PHRASE} see your profile, nobody else does, and nobody can find you.`}
        </p>
        <p className="text-hint">Your political-fit answers have their own settings, under Political fit on your profile.</p>
      </header>
      <SharingForm choices={sharing.choices} />
    </main>
  );
}
