"use client";

import { useSyncExternalStore } from "react";
import { relativeTime } from "@/lib/format";

/** Re-render every minute so "just now" moves on. */
function everyMinute(cb: () => void) {
  const t = setInterval(cb, 60_000);
  return () => clearInterval(t);
}
const minute = () => Math.floor(Date.now() / 60_000);

/**
 * "12 min ago", computed in the browser (the server's clock and zone aren't
 * the viewer's). The exact local time is in the tooltip and the <time> tag.
 */
export function RelativeTime({ iso }: { iso: string }) {
  const tick = useSyncExternalStore(everyMinute, minute, () => -1);
  const client = tick !== -1;
  const d = new Date(iso);
  const exact = d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", ...(client ? {} : { timeZone: "UTC" }) });
  return (
    <time dateTime={iso} title={exact}>
      {client ? relativeTime(d, new Date(tick * 60_000 + 59_999)) : `${exact} UTC`}
    </time>
  );
}
