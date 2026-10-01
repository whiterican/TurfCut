"use client";

import { useSyncExternalStore } from "react";

function everyThirtySeconds(cb: () => void) {
  const t = setInterval(cb, 30_000);
  return () => clearInterval(t);
}
const tick = () => Math.floor(Date.now() / 30_000);

const duration = (ms: number) => {
  const m = Math.floor(ms / 60_000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents >= 10_000 ? 0 : 2, minimumFractionDigits: 0 })}`;

/**
 * Time worked and the earnings estimate on the live field-day card, ticking
 * while the worker is on shift (not on a break). The server's numbers are
 * shown first; the browser keeps them moving.
 */
export function LiveShiftStats({
  activeMs,
  running,
  renderedAt,
  pay,
}: {
  activeMs: number;
  running: boolean;
  renderedAt: number;
  /** Hourly: cents per hour (grows with time). Otherwise a fixed estimate. */
  pay: { kind: "hourly"; centsPerHour: number; label: string } | { kind: "fixed"; cents: number; label: string } | null;
}) {
  const t = useSyncExternalStore(everyThirtySeconds, tick, () => -1);
  const ms = activeMs + (running && t !== -1 ? Math.max(0, t * 30_000 - renderedAt) : 0);
  const cents = !pay ? null : pay.kind === "hourly" ? Math.floor((pay.centsPerHour * ms) / 3_600_000) : pay.cents;
  return (
    <p className="flex flex-wrap gap-x-8 gap-y-2">
      <span>
        <span className="block text-lg font-bold tabular-nums">{duration(ms)}</span>
        <span className="hero-muted text-sm">Time worked</span>
      </span>
      {pay && cents !== null && (
        <span>
          <span className="block text-lg font-bold tabular-nums">{dollars(cents)}</span>
          <span className="hero-muted text-sm">{pay.label}</span>
        </span>
      )}
    </p>
  );
}
