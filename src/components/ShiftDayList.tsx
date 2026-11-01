"use client";

import type { Status } from "@/lib/status";
import { StatusBadge } from "@/components/StatusBadge";
import Link from "next/link";
import { ClipboardList, Navigation } from "lucide-react";
import { useSyncExternalStore } from "react";
import { directionsHref } from "@/lib/directions";

export interface DayShift {
  id: string;
  startsAt: string;
  endsAt: string;
  title: string;
  org: string;
  staging: string | null;
  status: Status;
}

const noop = () => () => {};
/** The viewer's calendar day, `offset` days from now, as YYYY-MM-DD. */
const localDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA");
};

/**
 * Shifts grouped under the day they start (#111, screen 4): a day heading
 * ("Today", "Tomorrow", "Sun, Oct 26"), then one white card per shift with a
 * narrow accent in its status colour, the title, times, place and
 * organization, the real status pill, and two actions: the shift itself and
 * directions to its staging point (only when there is one). Days keep the
 * order they're given in, so pass the shifts sorted by start (soonest first,
 * or newest first for the past). Days are the viewer's own: the server
 * doesn't know the time zone, so it groups by UTC and the browser regroups
 * after hydration, as LocalTime does.
 */
export function ShiftDayList({ shifts, headingLevel = 3 }: { shifts: DayShift[]; /** The day headings' level under the page's own headings. */ headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
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
    const last = groups.at(-1); // sorted input: a day's shifts are consecutive
    if (last?.key === key) last.items.push(s);
    else groups.push({ key, label: heading(key, s.startsAt), items: [s] });
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={`${g.key}-${g.items[0].id}`} className="space-y-2.5" aria-label={g.label}>
          <H className="day-heading">{g.label}</H>
          <ul className="space-y-2.5">
            {g.items.map((s) => (
              <li key={s.id} className="shift-card" data-state={s.status.state}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link transitionTypes={["nav-forward"]} href={`/shifts/${s.id}`} className="t-section block text-fg hover:underline">{s.title}</Link>
                    <p className="text-sm text-subtle tabular-nums">{time(s.startsAt)} – {time(s.endsAt)}</p>
                    <p className="truncate text-sm text-subtle">{s.staging ? `${s.staging} · ` : ""}{s.org}</p>
                  </div>
                  <StatusBadge status={s.status} className="shrink-0" />
                </div>
                <div className="shift-card-actions">
                  <Link transitionTypes={["nav-forward"]} href={`/shifts/${s.id}`} className="btn-secondary btn-sm"><ClipboardList aria-hidden className="btn-icon" />View details<span className="sr-only"> for {s.title}</span></Link>
                  {s.staging && (
                    <a href={directionsHref(s.staging)} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm"><Navigation aria-hidden className="btn-icon" />Get directions<span className="sr-only"> to {s.staging} (opens your maps app)</span></a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
