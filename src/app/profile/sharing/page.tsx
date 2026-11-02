import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { loadSharing } from "@/lib/sharing-data";
import { SHARING_COPY } from "@/lib/sharing";
import { geoTables, resolveArea } from "@/lib/geo";
import { SharingForm } from "@/components/SharingForm";
import { Masthead } from "@/components/Masthead";
import { ChevronLeft } from "lucide-react";
import { ReadingPage } from "@/components/layout/Page";

const dateText = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function SharingPage() {
  const { workerId } = await requireWorker();
  const sharing = await loadSharing(workerId);
  // From the saved choices, as the profile reads them: findable, but a home area Matches can't place.
  const { findable, homeArea } = sharing.choices;
  const unplaced = findable && homeArea && !resolveArea(homeArea, await geoTables()) ? homeArea : null;

  return (
    <ReadingPage gap={8}>
      <div className="space-y-3">
        <Masthead title="Who sees what">
          <Link transitionTypes={["nav-back"]} href="/profile" className="btn-ghost"><ChevronLeft aria-hidden className="size-4 shrink-0" />Profile</Link>
        </Masthead>
        {/* The words come from SHARING_COPY, pinned to SHARING_TEXT_VERSION (sharing-copy.test.ts). */}
        <p className="lead">{SHARING_COPY.lead}</p>
        <p className="text-hint">{sharing.savedAt ? SHARING_COPY.lastChanged(dateText(sharing.savedAt)) : SHARING_COPY.notChanged}</p>
        <p className="text-hint">{SHARING_COPY.politicalFitHint}</p>
      </div>
      <SharingForm choices={sharing.choices} unplacedArea={unplaced} />
    </ReadingPage>
  );
}
