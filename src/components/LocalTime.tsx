"use client";

import { useSyncExternalStore } from "react";
import { sameDay } from "@/lib/same-day";

const noop = () => () => {};

/**
 * A time in the viewer's own time zone. The server doesn't know it, so the
 * server render shows UTC and the browser replaces it after hydration.
 * "short" is a date and time without the weekday, for dense tables.
 * "full" and "fulldate" carry the year: for receipts and statements that are kept.
 * `from` makes a "time" the end of a range: it gains its date when it falls on
 * another day than `from` in the zone shown, so a span never reads as one day.
 */
export function LocalTime({ iso, mode: asked = "datetime", from }: { iso: string; mode?: "datetime" | "short" | "time" | "date" | "full" | "fulldate"; from?: string }) {
  const local = useSyncExternalStore(noop, () => true, () => false);
  const d = new Date(iso);
  const mode = asked === "time" && from && !sameDay(from, iso, local ? undefined : "UTC") ? "short" : asked;
  const opts: Intl.DateTimeFormatOptions =
    mode === "time"
      ? { hour: "numeric", minute: "2-digit" }
      : mode === "short"
        ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
      : mode === "date"
        ? { weekday: "short", month: "short", day: "numeric" }
        : mode === "fulldate"
          ? { month: "short", day: "numeric", year: "numeric" }
          : mode === "full"
            ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
            : { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  const text = d.toLocaleString("en-US", local ? opts : { ...opts, timeZone: "UTC" }) + (local ? "" : " UTC");
  return <time dateTime={iso}>{text}</time>;
}
