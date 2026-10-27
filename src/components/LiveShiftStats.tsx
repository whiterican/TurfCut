"use client";

import { useState, useSyncExternalStore } from "react";
import { CountUp, Ring } from "@/components/Moments";
import { shiftFill } from "@/lib/moments";

/**
 * A per-instance clock that starts when the component mounts in the browser
 * and reports elapsed time in 30-second steps. Measuring from the browser's
 * own mount time (not the server's render time) keeps a phone with a wrong
 * clock from inflating or freezing the numbers.
 */
function makeElapsedClock() {
  let start: number | null = null;
  return {
    subscribe(cb: () => void) {
      if (start === null) start = Date.now();
      cb();
      const t = setInterval(cb, 30_000);
      return () => clearInterval(t);
    },
    get: () => (start === null ? 0 : Math.floor((Date.now() - start) / 30_000) * 30_000),
  };
}

const duration = (ms: number) => {
  const m = Math.floor(ms / 60_000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
/** "$42.50"; whole dollars (rounded down) from $100 up — an estimate shouldn't round up. */
const dollars = (cents: number) =>
  cents >= 10_000 ? `$${Math.floor(cents / 100).toLocaleString("en-US")}` : `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Time worked and the earnings estimate on the live field-day card, ticking
 * while the worker is on shift (not on a break) up to the scheduled end.
 */
export function LiveShiftStats({
  shiftId,
  activeMs,
  running,
  maxExtraMs,
  scheduledMs,
  pay,
}: {
  shiftId: string;
  activeMs: number;
  running: boolean;
  /** Time left until the scheduled end when the page was rendered. */
  maxExtraMs: number;
  /** The shift's scheduled length, for the ring. */
  scheduledMs: number;
  /** Hourly: cents per hour (grows with time). Otherwise a fixed estimate. */
  pay: { kind: "hourly"; centsPerHour: number; label: string } | { kind: "fixed"; cents: number; label: string } | null;
}) {
  const [clock] = useState(makeElapsedClock);
  const elapsed = useSyncExternalStore(clock.subscribe, clock.get, () => 0);
  const ms = activeMs + (running ? Math.min(elapsed, Math.max(0, maxExtraMs)) : 0);
  const cents = !pay ? null : pay.kind === "hourly" ? Math.floor((pay.centsPerHour * ms) / 3_600_000) : pay.cents;
  // The ring fills with the share of the scheduled time worked; it starts at check-in with a visible cap.
  const fill = running ? Math.max(0.02, shiftFill(ms, scheduledMs)) : shiftFill(ms, scheduledMs);
  return (
    <p className="flex flex-wrap items-center gap-x-8 gap-y-2">
      <span className="flex items-center gap-3">
        <Ring fill={fill} seenKey={`shift:${shiftId}`} />
        <span>
          <span className="block text-lg font-bold tabular-nums">{duration(ms)}</span>
          <span className="hero-muted text-sm">Time worked</span>
        </span>
      </span>
      {pay && cents !== null && (
        <span>
          <span className="block text-lg font-bold tabular-nums"><CountUp value={cents} format={dollars} /></span>
          <span className="hero-muted text-sm">{pay.label}</span>
        </span>
      )}
    </p>
  );
}
