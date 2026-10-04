import Link from "next/link";
import { ROLE_LABELS } from "@/lib/access";
import { requireArea } from "@/lib/employer-session";
import { db } from "@/lib/db";
import { loadDesk } from "@/lib/desk-data";
import { Masthead } from "@/components/staff/Masthead";
import { DataTable } from "@/components/staff/DataTable";
import { SummaryBar } from "@/components/staff/SummaryBar";
import { LocalTime } from "@/components/LocalTime";

/** Today in the field: the strip owners and supervisors see first. */
function FieldToday({ ops }: { ops: NonNullable<Awaited<ReturnType<typeof loadDesk>>["today"]> }) {
  return (
    <div className="hero-card space-y-4">
      <p className="eyebrow">In the field today</p>
      <p className="hero-title">{ops.scheduled === 1 ? "1 shift" : `${ops.scheduled} shifts`} under way</p>
      <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span><span className="block text-lg font-bold tabular-nums">{ops.checkedIn} / {ops.scheduled}</span><span className="hero-muted">Checked in</span></span>
        <span><span className="block text-lg font-bold tabular-nums">{ops.signatures}</span><span className="hero-muted">Signatures submitted</span></span>
        {ops.doors > 0 && <span><span className="block text-lg font-bold tabular-nums">{ops.doors}</span><span className="hero-muted">Doors</span></span>}
        {ops.upcoming > 0 && <span><span className="block text-lg font-bold tabular-nums">{ops.upcoming}</span><span className="hero-muted">Starting in the next 24h</span></span>}
      </p>
    </div>
  );
}

/** Each organization role's home (C1.3): what needs them, today, and the week ahead. */
export default async function DeskPage() {
  const session = await requireArea("desk");
  const [org, desk] = await Promise.all([
    db().organization.findUnique({ where: { id: session.orgId }, select: { name: true } }),
    loadDesk({ profileId: session.userId, orgId: session.orgId, role: session.role }),
  ]);
  const { parts } = desk;

  return (
    <main className="page">
      <Masthead eyebrow="Desk" title={org?.name ?? "Your organization"} meta={ROLE_LABELS[session.role]} />

      {parts.today && desk.today && <FieldToday ops={desk.today} />}

      {!parts.readOnly && (
        <section className="section" aria-labelledby="needs-you">
          <h2 id="needs-you" className="section-title flex items-center justify-between">
            Needs you <span className="text-xs font-medium text-subtle">{desk.needs.length} {desk.needs.length === 1 ? "item" : "items"}</span>
          </h2>
          {desk.needs.length === 0 ? (
            <p className="text-muted-sm">
              Nothing right now.{" "}
              {[parts.field && "Late check-ins and shifts to review", parts.hiring && "applications and open seats", parts.pay && "pay to approve and disputes"].filter(Boolean).join(", ")} show up here.
            </p>
          ) : (
            <ul className="list-card">
              {desk.needs.map((n) => (
                <li key={n.key}>
                  <Link transitionTypes={["nav-forward"]} href={n.href} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-fg">{n.title}</span>
                      <span className="block truncate text-xs text-muted">{n.sub}</span>
                    </span>
                    <span className={n.badge}>{n.tag}</span>
                  </Link>
                </li>
              ))}
            </ul>
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
                scheduled: { text: r.headcount === null ? String(r.scheduled) : `${r.scheduled} of ${r.headcount}`, sort: r.scheduled },
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
            <p className="text-hint">Campaign profiles and posts arrive in a later release; for now the Desk shows what&apos;s live.</p>
          </section>
        </>
      )}
    </main>
  );
}
