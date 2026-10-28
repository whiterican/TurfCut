import Link from "next/link";
import { ROLE_LABELS } from "@/lib/access";
import { requireArea } from "@/lib/employer-session";
import { db } from "@/lib/db";
import { loadDesk } from "@/lib/desk-data";
import { Masthead } from "@/components/staff/Masthead";
import { WorkspacePage } from "@/components/layout/Page";
import { DataTable } from "@/components/staff/DataTable";
import { NeedsTable } from "@/components/staff/NeedsTable";
import { SummaryBar } from "@/components/staff/SummaryBar";
import { LocalTime } from "@/components/LocalTime";
import { StatusChip } from "@/components/StatusBadge";
import { roleName } from "@/lib/org-roles";
import { liveRows } from "@/lib/field-day-data";
import { summarizeField } from "@/lib/field-live";
import { FieldLiveProvider, LiveFigure, LiveRatio } from "@/components/staff/FieldLive";
import { CoverageMap } from "@/components/staff/CoverageMap";
import { URGENCY } from "@/lib/desk";

/** The "Needs you" kinds as the overview's side panel counts them, in urgency order. */
const NEED_LABELS: Record<keyof typeof URGENCY, string> = {
  late: "Late check-ins",
  noCheckout: "No check-out received",
  overdue: "Disputes overdue",
  review: "Shifts to review",
  dueToday: "Disputes due today",
  payApprove: "Pay lines to approve",
  applications: "Applications waiting",
  dispute: "Open disputes",
  short: "Jobs short of workers",
};

/**
 * Today in the field (#111, screen 10): three source-backed tiles, scoped to
 * today, then the field activity map (assigned turf only, never a person's
 * position) beside what needs the organization. Figures tick while the page
 * is open (P1.7). Unknown is never shown as zero: a tile appears only when the
 * loader could count it.
 */
function FieldToday({ ops, now, needs }: { ops: NonNullable<Awaited<ReturnType<typeof loadDesk>>["today"]>; now: Date; needs: Array<{ rank: number }> }) {
  const live = summarizeField(liveRows(ops.rows), now);
  const t = live.today;
  const quiet = ops.scheduled === 0 && ops.upcoming === 0;
  const counts = (Object.keys(URGENCY) as Array<keyof typeof URGENCY>).map((k) => ({ k, n: needs.filter((x) => x.rank === URGENCY[k]).length })).filter((x) => x.n > 0);
  return (
    <FieldLiveProvider initial={live}>
      <section className="section" aria-labelledby="today-heading">
        <h2 id="today-heading" className="sr-only">Today</h2>
        <div className="stat-tiles">
          <div className="stat-tile">
            <p className="stat-tile-figure"><LiveFigure of="due" fallback={t.due} /></p>
            <p className="stat-tile-label">Shifts under way</p>
            <p className="stat-tile-note">{quiet ? "Nothing under way" : t.upcoming > 0 ? `${t.upcoming} starting in the next 24h` : "Today"}</p>
          </div>
          <div className="stat-tile">
            <p className="stat-tile-figure"><LiveRatio of="dueCheckedIn" over="due" fallback={[t.dueCheckedIn, t.due]} /></p>
            <p className="stat-tile-label">Checked in</p>
            <p className="stat-tile-note">Of the shifts due now</p>
          </div>
          <div className="stat-tile">
            <p className="stat-tile-figure"><LiveFigure of="signatures" fallback={t.signatures} /></p>
            <p className="stat-tile-label">Signatures submitted</p>
            <p className="stat-tile-note">Today, as workers report them</p>
          </div>
        </div>
      </section>
      <section className="section" aria-labelledby="field-activity">
        <h2 id="field-activity" className="section-title">Field activity</h2>
        <div className="overview-grid">
          {live.zones.length > 0 ? (
            <CoverageMap initial={live.zones} className="overview-map" />
          ) : (
            <div className="overview-map empty-state">
              <p className="empty-state-title">No assigned turf to show.</p>
              <p className="empty-state-body">Turf drawn on a shift appears here as its workers check in. Nobody&apos;s position is ever on this map.</p>
            </div>
          )}
          <aside className="space-y-4" aria-label="Field activity key and what needs you">
            <ul className="space-y-1.5 text-sm text-muted" aria-label="Map key">
              <li className="flex items-center gap-2"><span className="legend-dot legend-turf" aria-hidden /> Assigned turf</li>
              <li className="flex items-center gap-2"><span className="legend-dot legend-on" aria-hidden /> Workers checked in (turf only, no positions)</li>
            </ul>
            {counts.length > 0 ? (
              <ul className="space-y-2" aria-label="Needs you, by kind">
                {counts.map(({ k, n }) => (
                  <li key={k}>
                    <a href="#needs-you" className="need-tile">
                      <span className="need-tile-count">{n}</span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-fg">{NEED_LABELS[k]}</span>
                        <span className="block text-xs text-subtle">In the list below</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-sm">Nothing needs you right now.</p>
            )}
          </aside>
        </div>
      </section>
    </FieldLiveProvider>
  );
}

/** Each organization role's home (C1.3): what needs them, today, and the week ahead. */
export default async function DeskPage() {
  const session = await requireArea("desk");
  const now = new Date();
  const [org, desk] = await Promise.all([
    db().organization.findUnique({ where: { id: session.orgId }, select: { name: true } }),
    loadDesk({ profileId: session.userId, orgId: session.orgId, role: session.role, grants: session.grants }, now),
  ]);
  const { parts } = desk;

  return (
    <WorkspacePage head={<Masthead title="Overview" meta={`${org?.name ?? "Your organization"} · ${roleName(session, ROLE_LABELS)}`}><span className="period-chip">Today</span></Masthead>}>

      {parts.today && desk.today && <FieldToday ops={desk.today} now={now} needs={desk.needs} />}

      {/* A count only: names stay with the roles that run the field (the loader never reads them here). */}
      {!!desk.noCheckoutCount && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-fg">
          <StatusChip state="overdue" label="No check-out received" />
          {desk.noCheckoutCount === 1 ? "1 shift ended" : `${desk.noCheckoutCount} shifts ended`} without a check-out reaching Turfcut. Whoever runs your field days follows these up.
        </p>
      )}

      {!parts.readOnly && (
        <section className="section" aria-labelledby="needs-you">
          <div className="section-head">
            <h2 id="needs-you" className="section-title">Needs you</h2>
            <p className="text-xs text-subtle">
              {desk.needs.length} {desk.needs.length === 1 ? "item" : "items"} · as of <LocalTime iso={now.toISOString()} mode="time" />
            </p>
          </div>
          {desk.needs.length === 0 ? (
            <p className="text-muted-sm">
              Nothing right now.{" "}
              {[parts.field && "Late check-ins, missing check-outs and shifts to review", parts.hiring && "applications and open seats", parts.pay && "pay to approve and disputes"].filter(Boolean).join(", ")} show up here.
            </p>
          ) : (
            <NeedsTable items={desk.needs} />
          )}
        </section>
      )}

      {parts.week && desk.week && (
        <section className="section" aria-labelledby="week-ahead">
          <h2 id="week-ahead" className="section-title">The week ahead</h2>
          <p className="text-muted-sm">Different workers with a shift in the next 7 days, against each published job&apos;s headcount.</p>
          <DataTable
            caption="Scheduled workers against headcount, next 7 days"
            empty="No published jobs."
            initialSort={null}
            columns={[
              { key: "job", label: "Job", sortable: true },
              { key: "scheduled", label: "Scheduled", numeric: true, sortable: true },
              { key: "gap", label: "Unfilled", numeric: true, sortable: true },
            ]}
            rows={desk.week.map((r) => ({
              id: r.jobId,
              cells: {
                job: { text: r.title, href: `/jobs/${r.jobId}` },
                // "1 of 10": three columns fit a phone without sideways scrolling.
                // The bar builds on load (P1.7): the share of seats with someone scheduled; full when the job sets no number.
                scheduled: { text: r.headcount === null ? String(r.scheduled) : `${r.scheduled} of ${r.headcount}`, sort: r.scheduled, bar: r.headcount === null ? (r.scheduled > 0 ? 1 : 0) : Math.min(1, r.scheduled / r.headcount) },
                gap: { text: r.gap === null ? "—" : String(r.gap), sort: r.gap },
              },
            }))}
          />
        </section>
      )}

      {parts.readOnly && (
        <>
          {desk.today && (
            <SummaryBar
              label="Today's field totals"
              items={[
                { label: "Shifts under way", value: desk.today.scheduled },
                { label: "Checked in", value: desk.today.checkedIn },
                { label: "Signatures", value: desk.today.signatures },
                { label: "Doors", value: desk.today.doors },
              ]}
            />
          )}
          <section className="section" aria-labelledby="live-jobs">
            <h2 id="live-jobs" className="section-title">Live jobs</h2>
            {desk.live && desk.live.length > 0 ? (
              <ul className="list-card">
                {desk.live.map((j) => (
                  <li key={j.id}>
                    <Link href={`/jobs/${j.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition hover:bg-surface-2">
                      <span className="text-sm font-semibold text-fg">{j.title}</span>
                      {j.startsAt && <span className="text-xs text-muted"><LocalTime iso={j.startsAt.toISOString()} mode="date" /></span>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-sm">No published jobs right now.</p>
            )}
          </section>
        </>
      )}
    </WorkspacePage>
  );
}
