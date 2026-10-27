import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { shiftState, shiftStatusLabel } from "@/lib/field-day";
import { facts, loadWorkerShifts } from "@/lib/field-day-data";
import { ShiftDayList } from "@/components/ShiftDayList";
import { OfflineBrief } from "@/components/OfflineBrief";
import { briefPaths } from "@/lib/offline-brief-data";
import { loadWorkerSlots } from "@/lib/shift-slots-data";
import { loadAvailability } from "@/lib/availability-data";
import { OpenShiftList } from "@/components/OpenShiftList";
import { EmptyArt } from "@/components/EmptyState";
import { Masthead } from "@/components/Masthead";

/** Every shift across every campaign — the multi-campaign calendar. */
export default async function MyShiftsPage() {
  const { workerId, userId } = await requireWorker();
  const now = new Date();
  const [shifts, brief, slots, avail] = await Promise.all([loadWorkerShifts(workerId, now), briefPaths(workerId, now), loadWorkerSlots(workerId, now), loadAvailability(workerId)]);
  // Seats already taken show as shifts above; the list offers the rest.
  const open = slots.filter((s) => !s.myShiftId && s.state !== "ended");
  const upcoming = shifts.filter((s) => s.endsAt >= now);
  const recent = shifts.filter((s) => s.endsAt < now).reverse();

  // Grouped under their day (D2): times, place, organization and the status pill on each row.
  const list = (items: typeof shifts) => (
    <ShiftDayList
      shifts={items.map((s) => ({
        id: s.id,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        title: s.engagement.job.title,
        org: s.engagement.job.org.name,
        staging: s.stagingLocation,
        status: shiftStatusLabel(shiftState(facts(s))),
      }))}
    />
  );

  return (
    <main className="page max-w-2xl">
      {/* Saved on the phone for dead zones: today's and the next two days' shifts. */}
      <OfflineBrief userId={userId} paths={brief} />
      <Masthead title="My shifts" meta="Every campaign in one calendar. Shifts never overlap — scheduling checks across all of them.">
        <Link transitionTypes={["nav-forward"]} href="/shifts/turf" className="btn-secondary">My turf</Link>
      </Masthead>
      {upcoming.length === 0 ? (
        <div className="empty-state">
          <EmptyArt kind="shifts" />
          <p className="empty-state-title">No shifts scheduled</p>
          <p className="empty-state-body">Once you&apos;re hired, organizations schedule your shifts here.</p>
          <Link href="/jobs" className="btn-primary mt-4">Find work</Link>
        </div>
      ) : (
        list(upcoming)
      )}
      {open.length > 0 && (
        <section className="section" id="open-shifts">
          <h2 className="section-title">Open shifts</h2>
          <p className="text-muted-sm">On jobs you&apos;re hired for. First come, first served: a seat you take is yours at once and joins your shifts above (cancel it there if you can&apos;t make it, and the seat goes back). Shifts that fit the availability you set come first.</p>
          <OpenShiftList
            availability={avail.availability}
            items={open.map((s) => ({
              id: s.id,
              job: s.job,
              startsAt: s.startsAt.toISOString(),
              endsAt: s.endsAt.toISOString(),
              stagingLocation: s.stagingLocation,
              notes: s.notes,
              facts: { status: s.facts.status, headcount: s.facts.headcount, taken: s.facts.taken },
              state: s.state,
              blocked: s.blocked,
            }))}
          />
        </section>
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
