import { LocalTime } from "@/components/LocalTime";
import { LiveZoneBar, LiveZoneFigure } from "@/components/staff/FieldLive";
import type { TurfCard } from "@/lib/field-turf";

/**
 * The Field map's turf cards (#111, screen 11): one per turf drawn on a shift
 * in the window, with the one progress the data holds, shifts on the ground
 * now out of the shifts given the turf. The concept's stop counts and
 * percentage complete need a stop inventory (#110) and are not drawn.
 */
export function TurfCards({ cards, now }: { cards: TurfCard[]; now: Date }) {
  if (cards.length === 0) {
    return (
      <div className="turf-card">
        <p className="font-semibold text-fg">No turf in this window.</p>
        <p className="mt-1 text-sm text-subtle">Draw turf on a shift and it appears here, filling as its workers check in.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {cards.map((c) => (
        <li key={c.id} className="turf-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="turf-card-name">{c.name}</p>
              <p className="truncate text-sm text-subtle">
                {c.jobTitle}
                {c.jobs > 1 && ` and ${c.jobs - 1} more ${c.jobs === 2 ? "job" : "jobs"}`}
              </p>
            </div>
            <p className="turf-card-figure">
              <LiveZoneFigure id={c.id} of="onGround" fallback={c.onGround} /> of <LiveZoneFigure id={c.id} of="total" fallback={c.total} />
            </p>
          </div>
          <LiveZoneBar id={c.id} fallback={[c.onGround, c.total]} />
          <p className="text-xs text-subtle">
            {c.startsAt > now ? "Starts" : c.endsAt < now ? "Ended" : "On the ground now"} · <LocalTime iso={c.startsAt.toISOString()} mode="short" /> – <LocalTime iso={c.endsAt.toISOString()} mode="time" />
            {c.signatures > 0 && ` · ${c.signatures} signatures`}
            {c.doors > 0 && ` · ${c.doors} doors`}
          </p>
        </li>
      ))}
    </ul>
  );
}
