import Link from "next/link";
import { ROLE_LABELS } from "@/lib/access";
import { requireArea } from "@/lib/employer-session";
import { db } from "@/lib/db";
import { loadDesk } from "@/lib/desk-data";
import { Masthead } from "@/components/staff/Masthead";
import { DataTable } from "@/components/staff/DataTable";
import { NeedsTable } from "@/components/staff/NeedsTable";
import { SummaryBar } from "@/components/staff/SummaryBar";
import { LocalTime } from "@/components/LocalTime";
import { StatusChip } from "@/components/StatusBadge";
import { roleName } from "@/lib/org-roles";
import { liveRows } from "@/lib/field-day-data";
import { summarizeField } from "@/lib/field-live";
import { FieldLiveProvider, LiveFigure, LiveRatio, LiveRing, LiveShow } from "@/components/staff/FieldLive";

/** Today in the field: the strip owners and supervisors see first. Its figures tick while the page is open (P1.7). */
function FieldToday({ ops, now }: { ops: NonNullable<Awaited<ReturnType<typeof loadDesk>>["today"]>; now: Date }) {
  // Nothing under way and nothing starting soon: every figure is zero, so say so in words instead of a row of zeros.
  if (ops.scheduled === 0 && ops.upcoming === 0) {
    return (
      <div className="hero-card hero-card-quiet space-y-3">
        <p className="eyebrow">In the field today</p>
        <p className="hero-title">Nothing under way</p>
        <p className="hero-muted text-sm">Shifts starting in the next 24 hours show up here.</p>
      </div>
    );
  }
  const live = summarizeField(liveRows(ops.rows), now);
  const t = live.today;
  return (
    <FieldLiveProvider initial={live}>
      <div className="hero-card space-y-4">
        <p className="eyebrow">In the field today</p>
        <div className="flex items-center gap-3">
          <LiveRing of="dueCheckedIn" over="due" fallback={[t.dueCheckedIn, t.due]} className="shrink-0" />
          <p className="hero-title"><LiveFigure of="due" fallback={t.due} unit={["shift", "shifts"]} /> under way</p>
        </div>
        <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span><span className="block text-lg font-bold tabular-nums"><LiveRatio of="dueCheckedIn" over="due" fallback={[t.dueCheckedIn, t.due]} /></span><span className="hero-muted">Checked in</span></span>
          <span><span className="block text-lg font-bold tabular-nums"><LiveFigure of="signatures" fallback={t.signatures} /></span><span className="hero-muted">Signatures submitted</span></span>
          <LiveShow of="doors" fallback={t.doors}><span><span className="block text-lg font-bold tabular-nums"><LiveFigure of="doors" fallback={t.doors} /></span><span className="hero-muted">Doors</span></span></LiveShow>
          <LiveShow of="upcoming" fallback={t.upcoming}><span><span className="block text-lg font-bold tabular-nums"><LiveFigure of="upcoming" fallback={t.upcoming} /></span><span className="hero-muted">Starting in the next 24h</span></span></LiveShow>
        </p>
      </div>
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
    <main className="page lg:max-w-5xl">
      <Masthead title={org?.name ?? "Your organization"} meta={roleName(session, ROLE_LABELS)} />

      {parts.today && desk.today && <FieldToday ops={desk.today} now={now} />}

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
    </main>
  );
}
