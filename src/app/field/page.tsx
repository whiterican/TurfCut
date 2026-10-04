import Link from "next/link";
import { requireArea } from "@/lib/employer-session";
import { loadFieldWindow, loadReviewCandidates } from "@/lib/field-day-data";
import { isoDay, reviewQueue } from "@/lib/field-view";
import { Masthead } from "@/components/staff/Masthead";
import { SummaryBar } from "@/components/staff/SummaryBar";
import { FieldBoard } from "@/components/staff/FieldBoard";

const H = 3_600_000;

/** In the field now (C1.4): the last 12 hours and the next 24, by job and staging point. */
export default async function FieldPage() {
  const session = await requireArea("field", "read");
  const now = new Date();
  const [rows, candidates] = await Promise.all([
    loadFieldWindow(session.orgId, new Date(now.getTime() - 12 * H), new Date(now.getTime() + 24 * H)),
    loadReviewCandidates(session.orgId, now),
  ]);
  const underWay = rows.filter((r) => r.startsAt <= now || r.state.checkedInAt);
  const waiting = reviewQueue(candidates).length;
  return (
    <main className="page max-w-4xl">
      <Masthead eyebrow="Field" title="In the field" meta="The last 12 hours and the next 24.">
        <Link href={`/field/${isoDay(now)}`} className="btn-ghost btn-sm">By date</Link>
        <Link href="/field/review" className="btn-secondary btn-sm">Review queue{waiting ? ` (${waiting})` : ""}</Link>
      </Masthead>
      <SummaryBar
        label="Field totals"
        items={[
          { label: "Under way", value: underWay.length },
          { label: "Checked in", value: underWay.filter((r) => r.state.checkedInAt).length },
          { label: "Packets out", value: rows.reduce((n, r) => n + r.state.packetsOut.length, 0) },
          { label: "Waiting for review", value: waiting },
        ]}
      />
      <FieldBoard rows={rows} empty="No shifts in the last 12 hours or the next 24." />
    </main>
  );
}
