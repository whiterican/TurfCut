"use client";

import { useSyncExternalStore } from "react";
import { relativeTime } from "@/lib/format";

const noop = () => () => {};

/**
 * "12 min ago", computed in the browser (the server's clock and zone aren't
 * the viewer's). The exact local time is in the tooltip and the <time> tag.
 */
export function RelativeTime({ iso }: { iso: string }) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  const d = new Date(iso);
  const exact = d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", ...(client ? {} : { timeZone: "UTC" }) });
  return (
    <time dateTime={iso} title={exact}>
      {client ? relativeTime(d, new Date()) : `${exact} UTC`}
    </time>
  );
}
