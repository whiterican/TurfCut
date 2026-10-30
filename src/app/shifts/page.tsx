import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { shiftState, shiftStatusLabel } from "@/lib/field-day";
import { facts, loadWorkerShifts } from "@/lib/field-day-data";
import { ShiftDayList } from "@/components/ShiftDayList";
import { SegmentedLinks } from "@/components/SegmentedLinks";
import { OfflineBrief } from "@/components/OfflineBrief";
import { briefPaths } from "@/lib/offline-brief-data";
import { loadWorkerSlots } from "@/lib/shift-slots-data";
import { loadAvailability } from "@/lib/availability-data";
import { loadCredentials } from "@/lib/credentials-data";
import { credentialName, expiryReminder, expiryToday } from "@/lib/credentials";
import { loadSharing } from "@/lib/sharing-data";
import { OpenShiftList } from "@/components/OpenShiftList";
import { EmptyArt } from "@/components/EmptyState";
import { Masthead } from "@/components/Masthead";
import { ChevronRight, ShieldAlert, UserCheck } from "lucide-react";
import { ListPage } from "@/components/layout/Page";

/**
 * My schedule (#111, screen 4): every campaign in one calendar. Upcoming or
 * Past (a real URL each), days with the concept's cards, open seats to take,
 * and the real actions a shift may be waiting on (a credential to renew, a
 * sharing choice to confirm): never a checklist invented for the look.
 */
export default async function MyShiftsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { workerId, userId } = await requireWorker();
  const now = new Date();
  const past = (await searchParams).view === "past";
  const [shifts, brief, slots, avail, creds, sharing] = await Promise.all([
    loadWorkerShifts(workerId, now),
    briefPaths(workerId, now),
    loadWorkerSlots(workerId, now),
    loadAvailability(workerId),
    loadCredentials(workerId),
    loadSharing(workerId),
  ]);
  // Seats already taken show as shifts above; the list offers the rest.
  const open = slots.filter((s) => !s.myShiftId && s.state !== "ended");
  const upcoming = shifts.filter((s) => s.endsAt >= now);
  const recent = shifts.filter((s) => s.endsAt < now).reverse();

  // Grouped under their day (D2): times, place, organization and the status pill on each card.
  const list = (items: typeof shifts, headingLevel: 2 | 3) => (
    <ShiftDayList
      headingLevel={headingLevel}
      shifts={items.map((s) => ({
        id: s.id,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        title: s.engagement.job.title,
        org: s.engagement.job.org.name,
        staging: s.stagingLocation,
        status: shiftStatusLabel(shiftState(facts(s)), { endsAt: s.endsAt, now }),
      }))}
    />
  );

  // Required actions: only what the records say is due. A credential expiring within 30 days or expired; a sharing choice not confirmed under today's wording.
  const today = expiryToday();
  const actions: Array<{ key: string; icon: typeof ShieldAlert; title: string; sub: string; href: string; label: string }> = [];
  for (const c of creds) {
    const when = expiryReminder(c.expiresOn, today);
    if (!when) continue;
    actions.push({
      key: `cred-${c.id}`,
      icon: ShieldAlert,
      title: when === "expired" ? `Renew ${credentialName(c)}` : `${credentialName(c)} expires soon`,
      sub: when === "expired" ? "Expired: renew before you work" : when === "7" ? "Within a week" : "Within 30 days",
      href: "/profile/credentials",
      label: "Update",
    });
  }
  if (!sharing.current) {
    actions.push({ key: "sharing", icon: UserCheck, title: sharing.version === null ? "Choose who sees what" : "Confirm who sees what", sub: "Organizations see your profile as the defaults say until you choose", href: "/profile/setup?from=shifts", label: sharing.version === null ? "Set up" : "Confirm" });
  }

  return (
    <ListPage>
      {/* Saved on the phone for dead zones: today's and the next two days' shifts. */}
      <OfflineBrief userId={userId} paths={brief} />
      <Masthead title="My schedule" />
      <SegmentedLinks label="Which shifts" items={[{ label: "Upcoming", href: "/shifts", current: !past }, { label: "Past", href: "/shifts?view=past", current: past }]} />

      {past ? (
        recent.length === 0 ? (
          <div className="empty-state">
            <EmptyArt kind="shifts" />
            <p className="empty-state-title">No past shifts yet.</p>
            <p className="empty-state-body">Shifts from the last 7 days show here; your full record is on your profile.</p>
            <Link href="/profile#record" className="btn-secondary mt-4">Work record</Link>
          </div>
        ) : (
          list(recent, 2)
        )
      ) : upcoming.length === 0 ? (
        <div className="empty-state">
          <EmptyArt kind="shifts" />
          <p className="empty-state-title">No shifts scheduled.</p>
          <p className="empty-state-body">Once you&apos;re hired, organizations schedule your shifts here.</p>
          <Link href="/jobs" className="btn-primary mt-4">Find Jobs</Link>
        </div>
      ) : (
        <>
          {list(upcoming, 2)}
          <p className="text-hint">Every campaign in one calendar. Shifts never overlap: scheduling checks across all of them.</p>
        </>
      )}

      {!past && open.length > 0 && (
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

      {!past && actions.length > 0 && (
        <section className="section" aria-labelledby="required-actions">
          <h2 id="required-actions" className="section-title">Required actions</h2>
          <ul className="divide-y divide-border">
            {actions.map((a) => (
              <li key={a.key} className="flex items-center gap-3 py-3">
                <a.icon aria-hidden className="size-5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-fg">{a.title}</span>
                  <span className="block text-sm text-subtle">{a.sub}</span>
                </span>
                <Link transitionTypes={["nav-forward"]} href={a.href} className="btn-primary btn-sm">{a.label}<ChevronRight aria-hidden className="btn-icon" /></Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </ListPage>
  );
}
