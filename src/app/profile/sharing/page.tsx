import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { loadSharing } from "@/lib/sharing-data";
import { RELATIONSHIP_PHRASE } from "@/lib/sharing";
import { SharingForm } from "@/components/SharingForm";
import { Masthead } from "@/components/Masthead";
import { ChevronLeft } from "lucide-react";
import { ReadingPage } from "@/components/layout/Page";

const dateText = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function SharingPage() {
  const { workerId } = await requireWorker();
  const sharing = await loadSharing(workerId);

  return (
    <ReadingPage gap={8}>
      <div className="space-y-3">
        <Masthead title="Who sees what">
          <Link transitionTypes={["nav-back"]} href="/profile" className="btn-ghost"><ChevronLeft aria-hidden className="size-4 shrink-0" />Profile</Link>
        </Masthead>
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
      </div>
      <SharingForm choices={sharing.choices} />
    </ReadingPage>
  );
}
