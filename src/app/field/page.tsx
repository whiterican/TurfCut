import Link from "next/link";
import { db } from "@/lib/db";
import { requireArea } from "@/lib/employer-session";
import { heldPackets, loadFieldWindow, loadReviewCandidates, REVIEW_CAP } from "@/lib/field-day-data";
import { isoDay, reviewQueue } from "@/lib/field-view";
import { Masthead } from "@/components/staff/Masthead";
import { SummaryBar } from "@/components/staff/SummaryBar";
import { FieldBoard } from "@/components/staff/FieldBoard";
import { CoverageMap } from "@/components/staff/CoverageMap";
import { FieldLiveProvider, LiveFigure } from "@/components/staff/FieldLive";
import { summarizeField } from "@/lib/field-live";

const H = 3_600_000;

/** In the field now (C1.4): the last 12 hours and the next 24, by job and staging point. */
export default async function FieldPage() {
  const session = await requireArea("field", "read");
  const now = new Date();
  const [rows, candidates, kept] = await Promise.all([
    loadFieldWindow(session.orgId, new Date(now.getTime() - 12 * H), new Date(now.getTime() + 24 * H)),
    loadReviewCandidates(session.orgId, now),
    // Packets workers kept for their next shift (C4.5), whenever that was: still out of the office.
    heldPackets(db(), { orgId: session.orgId }),
  ]);
  // Under way: checked in and not out, or due now and not checked in (late). Counted by the live summary, which the page then polls (P1.7).
  const live = summarizeField(rows, now);
  const waiting = reviewQueue(candidates).length;
  // The loader stops at REVIEW_CAP rows; if it did, there may be more than it shows.
  const more = candidates.length >= REVIEW_CAP;
  return (
    <FieldLiveProvider initial={live}>
    <main className="page max-w-4xl">
      <Masthead eyebrow="Field" title="In the field" meta="The last 12 hours and the next 24. Figures update on their own while this page is open.">
        <Link href={`/field/${isoDay(now)}`} className="btn-ghost btn-sm">By date (UTC)</Link>
        <Link href="/field/review" className="btn-secondary btn-sm">Review queue{waiting ? ` (${waiting}${more ? "+" : ""})` : ""}</Link>
      </Masthead>
      <SummaryBar
        label="Field totals"
        items={[
          { label: "Under way", value: <LiveFigure of="underWay" fallback={live.today.underWay} /> },
          { label: "Checked in", value: <LiveFigure of="onGround" fallback={live.today.onGround} /> },
          { label: "Packets out", value: <LiveFigure of="packetsOut" fallback={live.today.packetsOut} /> },
          { label: "Kept by workers", value: kept.filter((h) => h.takenOn === null).length },
          { label: "Waiting for review", value: `${waiting}${more ? "+" : ""}` },
        ]}
      />
      {live.zones.length > 0 && (
        <section className="section" aria-labelledby="coverage">
          <h2 id="coverage" className="section-title">Coverage</h2>
          <p className="text-muted-sm">Each turf fills as the workers given it check in and empties as they check out. Turfs only: nobody&apos;s position is on this map.</p>
          <CoverageMap initial={live.zones} />
        </section>
      )}
      <FieldBoard rows={rows} empty="No shifts in the last 12 hours or the next 24." />
    </main>
    </FieldLiveProvider>
  );
}
