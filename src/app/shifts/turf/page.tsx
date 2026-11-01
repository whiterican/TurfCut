import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { readTurf, turfMarks, turfMarksClosed } from "@/lib/field-day";
import { facts, loadWorkerTurf } from "@/lib/field-day-data";
import { LocalTime } from "@/components/LocalTime";
import { TurfMap } from "@/components/TurfMap";
import { PinLegend, TurfWorkbench } from "@/components/TurfWorkbench";
import { toMapPins } from "@/lib/turf-pins";
import { Masthead } from "@/components/Masthead";
import { ChevronLeft } from "lucide-react";
import { WorkspacePage } from "@/components/layout/Page";

/**
 * My turf: what each campaign assigned (or what the worker marked for the
 * day), with their pins — today first, then upcoming, across campaigns.
 */
export default async function MyTurfPage() {
  const { workerId } = await requireWorker();
  const now = new Date();
  const shifts = await loadWorkerTurf(workerId, now);

  return (
    <WorkspacePage head={<Masthead title="My turf" meta="Turf each campaign assigned you, or the area you marked for the day — plus your pins.">
        <Link transitionTypes={["nav-back"]} href="/shifts" className="btn-ghost"><ChevronLeft aria-hidden className="size-4 shrink-0" />My schedule</Link>
      </Masthead>}>

      {shifts.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No upcoming shifts</p>
          <p className="empty-state-body">When a campaign schedules you, its turf shows up here.</p>
        </div>
      ) : (
        shifts.map((s) => {
          const f = facts(s);
          const turf = readTurf(s.turfArea);
          const marks = turfMarks(f.events);
          const staging = s.stagingLat !== null && s.stagingLng !== null ? { lat: s.stagingLat, lng: s.stagingLng } : null;
          const open = turfMarksClosed(f, now) === null;
          return (
            <section key={s.id} className="section">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="eyebrow eyebrow-quiet">
                    <LocalTime iso={s.startsAt.toISOString()} mode="date" /> · <LocalTime iso={s.startsAt.toISOString()} mode="time" />
                  </p>
                  <h2 className="section-title">{s.engagement.job.title}</h2>
                  <p className="text-muted-sm">
                    {s.engagement.job.org.name}
                    {s.stagingLocation ? ` · check in at ${s.stagingLocation}` : ""}
                  </p>
                </div>
                <span className={turf ? "tag-solid" : marks.dayTurf ? "tag-butter" : "tag"}>
                  {turf ? "Assigned turf" : marks.dayTurf ? "Your turf today" : "No turf yet"}
                </span>
              </div>
              {open ? (
                <TurfWorkbench shiftId={s.id} turf={turf} dayTurf={marks.dayTurf} staging={staging} pins={marks.pins} canDrawDayTurf={!turf} />
              ) : turf || marks.dayTurf || staging ? (
                <>
                  <TurfMap turf={turf} dayTurf={marks.dayTurf} staging={staging} pins={toMapPins(marks.pins)} className="h-56" />
                  {marks.pins.length > 0 && <PinLegend />}
                  <p className="text-hint">{s.startsAt > now ? "You can drop pins from an hour before this shift." : "Turf marks for this shift are closed."}</p>
                </>
              ) : (
                <p className="text-muted-sm">No turf assigned yet. From an hour before the shift you can mark your own.</p>
              )}
              <Link transitionTypes={["nav-forward"]} href={`/shifts/${s.id}`} className="link text-sm">Open field day</Link>
            </section>
          );
        })
      )}
    </WorkspacePage>
  );
}
