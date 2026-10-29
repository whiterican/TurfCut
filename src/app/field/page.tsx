import Link from "next/link";
import { db } from "@/lib/db";
import { requireArea } from "@/lib/employer-session";
import { heldPackets, loadFieldWindow, loadReviewCandidates, REVIEW_CAP } from "@/lib/field-day-data";
import { isoDay, reviewQueue } from "@/lib/field-view";
import { readJobFilter, turfCards } from "@/lib/field-turf";
import { Masthead } from "@/components/staff/Masthead";
import { WorkspacePage } from "@/components/layout/Page";
import { SummaryBar } from "@/components/staff/SummaryBar";
import { FieldBoard } from "@/components/staff/FieldBoard";
import { CoverageMap } from "@/components/staff/CoverageMap";
import { TurfCards } from "@/components/staff/TurfCards";
import { FieldLiveProvider, LiveFigure, LiveRatio } from "@/components/staff/FieldLive";
import { summarizeField } from "@/lib/field-live";

const H = 3_600_000;
type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * The Field map (C1.4, #111 screen 11): the last 12 hours and the next 24,
 * as assigned turf on a map beside one card per turf, then every shift by
 * job and staging point. Turf only: nobody's position is on this map, and
 * the concept's stop counts wait for a stop inventory (#110).
 */
export default async function FieldPage({ searchParams }: { searchParams: Search }) {
  const session = await requireArea("field", "read");
  const now = new Date();
  const asked = readJobFilter((await searchParams).job);
  const [all, candidates, kept] = await Promise.all([
    loadFieldWindow(session.orgId, new Date(now.getTime() - 12 * H), new Date(now.getTime() + 24 * H)),
    loadReviewCandidates(session.orgId, now),
    // Packets workers kept for their next shift (C4.5), whenever that was: still out of the office.
    heldPackets(db(), { orgId: session.orgId }),
  ]);
  const jobs = [...new Map(all.map((r) => [r.jobId, r.jobTitle])).entries()].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  // The job filter narrows everything on the page, the polled figures included (the summary route takes the same `job`).
  // A job not in the window (a stale link, someone else's id) is no filter at all, so the page and its control agree.
  const job = asked && jobs.some((j) => j.id === asked) ? asked : null;
  const rows = job ? all.filter((r) => r.jobId === job) : all;
  // Under way: checked in and not out, or due now and not checked in (late). Counted by the live summary, which the page then polls (P1.7).
  const live = summarizeField(rows, now);
  const cards = turfCards(rows);
  const heldNow = kept.filter((h) => h.takenOn === null).length;
  const waiting = reviewQueue(candidates).length;
  // The loader stops at REVIEW_CAP rows; if it did, there may be more than it shows.
  const more = candidates.length >= REVIEW_CAP;
  return (
    <FieldLiveProvider initial={live} endpoint={job ? `/api/field/summary?job=${encodeURIComponent(job)}` : undefined}>
      <WorkspacePage
        gap={8}
        head={
          <Masthead title="Field map" meta="The last 12 hours and the next 24. Assigned turf only: nobody's position is on this map. Figures update on their own while this page is open.">
            <Link href={`/field/${isoDay(now)}`} className="btn-ghost btn-sm">By date (UTC)</Link>
            <Link href="/field/review" className="btn-secondary btn-sm">Review queue{waiting ? ` (${waiting}${more ? "+" : ""})` : ""}</Link>
          </Masthead>
        }
      >
        <SummaryBar
          label="Field totals"
          items={[
            { label: "Shifts under way", value: <LiveFigure of="underWay" fallback={live.today.underWay} />, hint: job ? "On this job: checked in, or due now" : "Checked in, or due now" },
            { label: "On the ground", value: <LiveRatio of="onGround" over="underWay" fallback={[live.today.onGround, live.today.underWay]} />, hint: "Checked in now, of the shifts under way" },
            { label: "Packets out", value: <LiveFigure of="packetsOut" fallback={live.today.packetsOut} />, hint: heldNow ? `${heldNow} more kept by workers` : "None kept by workers" },
            { label: "Waiting for review", value: `${waiting}${more ? "+" : ""}`, hint: "Checked out, no closeout yet" },
          ]}
        />
        <section className="section" aria-labelledby="turf-heading">
          <div className="section-head">
            <h2 id="turf-heading" className="section-title">Turf</h2>
            <form className="map-controls" method="get" action="/field">
              <label htmlFor="field-job" className="sr-only">Job</label>
              <select id="field-job" name="job" className="field" defaultValue={job ?? ""}>
                <option value="">All jobs</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.title}</option>
                ))}
              </select>
              <button type="submit" className="btn-secondary btn-sm">Show</button>
              {job && <Link href="/field" className="btn-ghost btn-sm">Clear</Link>}
            </form>
          </div>
          <div className="overview-grid">
            {live.zones.length > 0 ? (
              <CoverageMap initial={live.zones} className="overview-map field-map" />
            ) : (
              <div className="overview-map field-map empty-state">
                <p className="empty-state-title">No assigned turf to show.</p>
                <p className="empty-state-body">Turf drawn on a shift appears here, filling as its workers check in. Nobody&apos;s position is ever on this map.</p>
              </div>
            )}
            <aside aria-label="Turf cards">
              <TurfCards cards={cards} now={now} />
            </aside>
          </div>
        </section>
        <section className="section" aria-labelledby="shifts-heading">
          <h2 id="shifts-heading" className="section-title">Shifts</h2>
          <FieldBoard rows={rows} empty={job ? "No shifts on this job in the last 12 hours or the next 24." : "No shifts in the last 12 hours or the next 24."} />
        </section>
      </WorkspacePage>
    </FieldLiveProvider>
  );
}
