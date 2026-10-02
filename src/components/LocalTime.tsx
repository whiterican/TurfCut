"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * A time in the viewer's own time zone. The server doesn't know it, so the
 * server render shows UTC and the browser replaces it after hydration.
 */
export function LocalTime({ iso, mode = "datetime" }: { iso: string; mode?: "datetime" | "time" | "date" }) {
  const local = useSyncExternalStore(noop, () => true, () => false);
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions =
    mode === "time"
      ? { hour: "numeric", minute: "2-digit" }
      : mode === "date"
        ? { weekday: "short", month: "short", day: "numeric" }
        : { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  const text = d.toLocaleString("en-US", local ? opts : { ...opts, timeZone: "UTC" }) + (local ? "" : " UTC");
  return <time dateTime={iso}>{text}</time>;
}
