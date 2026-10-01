"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/**
 * "Today · 9:00 AM", "Tomorrow · 9:00 AM", else "Thu, Oct 2 · 9:00 AM" — in
 * the viewer's own time zone (the server renders UTC, then the browser fixes it).
 */
export function DayTime({ iso }: { iso: string }) {
  const local = useSyncExternalStore(noop, () => true, () => false);
  const d = new Date(iso);
  const zone = local ? {} : { timeZone: "UTC" };
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...zone });
  if (!local) return <time dateTime={iso}>{d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...zone })} · {time} UTC</time>;
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const day = dayKey(d) === dayKey(now) ? "Today" : dayKey(d) === dayKey(tomorrow) ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return <time dateTime={iso}>{day} · {time}</time>;
}
