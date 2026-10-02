import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { shiftState, shiftStatusLabel } from "@/lib/field-day";
import { facts, loadWorkerShifts } from "@/lib/field-day-data";
import { LocalTime } from "@/components/LocalTime";
import { OfflineBrief } from "@/components/OfflineBrief";

/** Every shift across every campaign — the multi-campaign calendar. */
export default async function MyShiftsPage() {
  const { workerId } = await requireWorker();
  const now = new Date();
  const shifts = await loadWorkerShifts(workerId, now);
  const upcoming = shifts.filter((s) => s.endsAt >= now);
  // Saved on the phone for dead zones: today's and the next two days' shifts.
  const brief = ["/dashboard", "/shifts", ...upcoming.filter((s) => s.status !== "CANCELLED" && s.startsAt.getTime() < now.getTime() + 48 * 3_600_000).map((s) => `/shifts/${s.id}`)];
  const recent = shifts.filter((s) => s.endsAt < now).reverse();

  const list = (items: typeof shifts) => (
    <ul className="space-y-3">
      {items.map((s) => {
        const b = shiftStatusLabel(shiftState(facts(s)));
        return (
          <li key={s.id}>
            <Link transitionTypes={["nav-forward"]} href={`/shifts/${s.id}`} className="card flex items-start justify-between gap-3 transition hover:border-[var(--border-strong)]">
              <span className="min-w-0 space-y-1">
                <span className="eyebrow block">
                  <LocalTime iso={s.startsAt.toISOString()} mode="date" />
                </span>
                <span className="block font-bold text-fg">{s.engagement.job.title}</span>
                <span className="text-muted-sm block">
                  <LocalTime iso={s.startsAt.toISOString()} mode="time" /> – <LocalTime iso={s.endsAt.toISOString()} mode="time" />
                  {s.stagingLocation ? ` · ${s.stagingLocation}` : ""} · {s.engagement.job.org.name}
                </span>
              </span>
              <span className={b.badge}>{b.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <main className="page max-w-2xl">
      <OfflineBrief paths={brief} />
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Shifts</p>
          <h1 className="page-title">My shifts</h1>
          <p className="text-muted-sm">Every campaign in one calendar. Shifts never overlap — scheduling checks across all of them.</p>
        </div>
        <Link transitionTypes={["nav-forward"]} href="/shifts/turf" className="btn-secondary">My turf</Link>
      </header>
      {upcoming.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No shifts scheduled</p>
          <p className="empty-state-body">Once you&apos;re hired, organizations schedule your shifts here.</p>
          <Link href="/jobs" className="btn-primary mt-4">Find work</Link>
        </div>
      ) : (
        list(upcoming)
      )}
      {recent.length > 0 && (
        <section className="section">
          <h2 className="section-title">Last 7 days</h2>
          {list(recent)}
        </section>
      )}
    </main>
  );
}
