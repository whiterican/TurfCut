import Link from "next/link";
import { db } from "@/lib/db";
import { requireArea } from "@/lib/employer-session";
import { heldPackets, loadFieldWindow, loadReviewCandidates, REVIEW_CAP } from "@/lib/field-day-data";
import { isoDay, reviewQueue } from "@/lib/field-view";
import { knownJob, readJobFilter, turfCards } from "@/lib/field-turf";
import { Masthead } from "@/components/staff/Masthead";
import { WorkspacePage } from "@/components/layout/Page";
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
  const all = await loadFieldWindow(session.orgId, new Date(now.getTime() - 12 * H), new Date(now.getTime() + 24 * H));
  const jobs = [...new Map(all.map((r) => [r.jobId, r.jobTitle])).entries()].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  // A job not in the window (a stale link, someone else's id) is no filter at all, so the page and its control agree.
  const job = knownJob(asked, jobs);
  // Every figure on the page has one scope (#113 review, P1): the job filter is applied inside each query, before its cap,
  // never to a capped organization result. The Review queue link keeps the organization's count: it opens the whole queue.
  const [orgCandidates, jobCandidates, kept] = await Promise.all([
    loadReviewCandidates(session.orgId, now),
    job ? loadReviewCandidates(session.orgId, now, 30, { jobId: job }) : null,
    // Packets workers kept for their next shift (C4.5), whenever that was: still out of the office. Same window with or without a job.
    heldPackets(db(), { orgId: session.orgId, ...(job ? { jobId: job, recent: true } : {}) }),
  ]);
  const rows = job ? all.filter((r) => r.jobId === job) : all;
  // Under way: checked in and not out, or due now and not checked in (late). Counted by the live summary, which the page then polls (P1.7).
  const live = summarizeField(rows, now);
  const cards = turfCards(rows);
  const heldNow = kept.filter((h) => h.takenOn === null).length;
  // The loader stops at REVIEW_CAP rows; if it did, there may be more than it shows ("+").
  const orgWaiting = reviewQueue(orgCandidates).length;
  const orgMore = orgCandidates.length >= REVIEW_CAP;
  const scoped = jobCandidates ?? orgCandidates;
  const waiting = reviewQueue(scoped).length;
  const more = scoped.length >= REVIEW_CAP;
  return (
    <FieldLiveProvider initial={live} endpoint={job ? `/api/field/summary?job=${encodeURIComponent(job)}` : undefined}>
      <WorkspacePage
        gap={6}
        head={
          <Masthead title="Field map" meta="The last 12 hours and the next 24 · assigned turf only, never anyone's position · figures update while this page is open">
            <Link href={`/field/${isoDay(now)}`} className="btn-ghost btn-sm">By date (UTC)</Link>
            <Link href="/field/review" className="btn-secondary btn-sm">Review queue{orgWaiting ? ` (${job ? "all jobs: " : ""}${orgWaiting}${orgMore ? "+" : ""})` : ""}</Link>
          </Masthead>
        }
      >
        {/* One strip above the dominant map (#113 review, P4): the scope, the live figures in words, and the job filter. */}
        <section className="field-strip" aria-labelledby="figures-heading">
          <h2 id="figures-heading" className="sr-only">Field figures</h2>
          <div className="min-w-0 space-y-1">
            <p className="summary-band-scope">{job ? "This job" : "All jobs"}</p>
            <dl className="summary-band">
              <div><dt>Under way</dt><dd><LiveFigure of="underWay" fallback={live.today.underWay} /></dd></div>
              <div><dt>On the ground</dt><dd><LiveRatio of="onGround" over="underWay" fallback={[live.today.onGround, live.today.underWay]} /></dd></div>
              <div><dt>Packets out</dt><dd><LiveFigure of="packetsOut" fallback={live.today.packetsOut} /></dd></div>
              {heldNow > 0 && <div><dt>Kept by workers</dt><dd>{heldNow}</dd></div>}
              <div><dt>Waiting for review</dt><dd>{`${waiting}${more ? "+" : ""}`}</dd></div>
            </dl>
            {/* The definitions the tiles used to carry, kept beside the figures. */}
            <p className="text-hint">Under way: checked in, or due now and not yet checked in. Waiting for review: checked out, no closeout yet.</p>
          </div>
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
        </section>
        <section className="section" aria-labelledby="turf-heading">
          <h2 id="turf-heading" className="sr-only">Turf</h2>
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
