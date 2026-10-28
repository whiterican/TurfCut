"use client";

import { useSyncExternalStore } from "react";
import { relativeDay } from "@/lib/relative-day";

// Re-read the clock each minute and when the app comes back into view, so
// "tomorrow" becomes "today" at midnight without a reload (as TodayDate does).
const subscribe = (onChange: () => void) => {
  const timer = setInterval(onChange, 60_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
};

/**
 * How far a moment is from now in the viewer's own calendar: "today",
 * "tomorrow", "in 3 days", "yesterday", "2 days ago". The server can't know
 * the viewer's zone, so it renders nothing and the browser fills the words in;
 * put a LocalTime date beside it, so the page is never wordless.
 * `trail` is what follows the words when they show (a separator, by default).
 */
export function RelativeDay({ iso, trail = " · " }: { iso: string; trail?: string }) {
  const words = useSyncExternalStore(
    subscribe,
    () => relativeDay(new Date(iso), new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone).words,
    () => ""
  );
  return words ? <>{words}{trail}</> : null;
}
