"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useSyncExternalStore } from "react";

export interface DayShift {
  id: string;
  startsAt: string;
  endsAt: string;
  title: string;
  org: string;
  staging: string | null;
  status: { label: string; badge: string };
}

const noop = () => () => {};
/** The viewer's calendar day, `offset` days from now, as YYYY-MM-DD. */
const localDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA");
};

/**
 * Shifts grouped under the day they start (D2, from the owner's schedule
 * mockup): a day heading ("Today", "Tomorrow", "Sat, Oct 25"), then one row
 * per shift with its times, place and organization, and its status as a pill.
 * Days keep the order they're given in (soonest first, or newest first for
 * the past week). Days are the viewer's own: the server doesn't know the time zone, so it
 * groups by UTC and the browser regroups after hydration, as LocalTime does.
 */
export function ShiftDayList({ shifts }: { shifts: DayShift[] }) {
  const local = useSyncExternalStore(noop, () => true, () => false);
  const zone = local ? undefined : "UTC";
  const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: zone });
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone });
  // Today and tomorrow by the viewer's clock, read outside render (blank on the server, which only shows dates).
  const today = useSyncExternalStore(noop, () => localDay(0), () => "");
  const tomorrow = useSyncExternalStore(noop, () => localDay(1), () => "");
  const heading = (key: string, iso: string) =>
    key === today
      ? "Today"
      : key === tomorrow
        ? "Tomorrow"
        : new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: zone }) + (local ? "" : " (UTC)");

  const groups: Array<{ key: string; label: string; items: DayShift[] }> = [];
  for (const s of shifts) {
    const key = dayKey(s.startsAt);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(s);
    else groups.push({ key, label: heading(key, s.startsAt), items: [s] });
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.key} className="space-y-2" aria-label={g.label}>
          <h3 className="day-heading">{g.label}</h3>
          <ul className="list-card divide-y divide-border">
            {g.items.map((s) => (
              <li key={s.id}>
                <Link transitionTypes={["nav-forward"]} href={`/shifts/${s.id}`} className="shift-row group">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-fg">{s.title}</span>
                    <span className="block text-sm text-muted tabular-nums">
                      {time(s.startsAt)} – {time(s.endsAt)}
                      {s.staging ? ` · ${s.staging}` : ""}
                    </span>
                    <span className="block text-sm text-muted">{s.org}</span>
                  </span>
                  <span className={`${s.status.badge} self-start`}>{s.status.label}</span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 self-center text-subtle transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
