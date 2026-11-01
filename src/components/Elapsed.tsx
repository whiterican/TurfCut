"use client";

import { useSyncExternalStore } from "react";
import { formatElapsed } from "@/lib/elapsed";

/** A minute-by-minute clock the component subscribes to; the server has no "now" of the viewer's, so it renders a dash. */
const subscribe = (onChange: () => void) => {
  const t = setInterval(onChange, 60_000);
  return () => clearInterval(t);
};
const minuteNow = () => Math.floor(Date.now() / 60_000);

/** "2h 30m" since an instant, on the viewer's clock, ticking each minute. */
export function Elapsed({ sinceIso }: { sinceIso: string }) {
  const minute = useSyncExternalStore(subscribe, minuteNow, () => null);
  if (minute === null) return <span aria-hidden>—</span>;
  return <span>{formatElapsed(minute - Math.floor(Date.parse(sinceIso) / 60_000))}</span>;
}
