"use client";

import { useSyncExternalStore } from "react";

// Re-read the clock each minute and when the app comes back into view, so an
// installed app left open past midnight never shows yesterday under "Today".
const subscribe = (onChange: () => void) => {
  const timer = setInterval(onChange, 60_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
};
const label = () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

/** Today's date in the viewer's own time zone ("Tuesday, Oct 27"). The server can't know it, so it renders a blank line that the browser fills. */
export function TodayDate() {
  const text = useSyncExternalStore(subscribe, label, () => "");
  return <span suppressHydrationWarning>{text || "\u00a0"}</span>;
}
