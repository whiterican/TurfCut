"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CountUp, Ring } from "@/components/Moments";
import { FIELD_POLL_MS, readSummary, type FieldSummary, type FieldTotals, type GroupTotals } from "@/lib/field-live";
import { ringFill } from "@/lib/moments";

/**
 * P1.7: the organizer's figures tick. The provider holds the newest summary
 * (the server's at first) and, while the tab is visible, asks
 * `/api/field/summary` for a fresh one every FIELD_POLL_MS. Consumers below
 * count from the shown value to the new one. When any shift's state changes
 * (the summary's version), the page re-renders on the server too, so the
 * lists under the figures catch up. Counts only: the summary names nobody.
 */

const Live = createContext<FieldSummary | null>(null);

export function useFieldLive(): FieldSummary | null {
  return useContext(Live);
}

export function FieldLiveProvider({ initial, endpoint = "/api/field/summary", children }: { initial: FieldSummary; endpoint?: string; children: ReactNode }) {
  const router = useRouter();
  const [summary, setSummary] = useState(initial);
  // A server render after our own fetch may be older than what we show: keep the newer.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    if (initial.at > summary.at) setSummary(initial);
  }
  // What the page shows now, for the poll to compare against (a server render adopted above counts too).
  const latest = useRef(summary);
  useEffect(() => {
    latest.current = summary;
  }, [summary]);

  useEffect(() => {
    let stopped = false;
    let inFlight: AbortController | null = null;
    const tick = async () => {
      if (document.visibilityState !== "visible" || inFlight) return;
      inFlight = new AbortController();
      try {
        const res = await fetch(endpoint, { cache: "no-store", signal: inFlight.signal, headers: { accept: "application/json" } });
        if (!res.ok) return;
        const next = readSummary(await res.json());
        if (stopped || !next || next.at <= latest.current.at) return;
        const changed = next.version !== latest.current.version;
        latest.current = next;
        setSummary(next);
        // Something about a shift changed: the names, badges and words under the figures re-render on the server.
        if (changed) router.refresh();
      } catch {
        // No signal or a slow server: the page keeps the figures it has and tries again next tick.
      } finally {
        inFlight = null;
      }
    };
    const every = window.setInterval(tick, FIELD_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      inFlight?.abort();
      window.clearInterval(every);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, endpoint]);

  return <Live.Provider value={summary}>{children}</Live.Provider>;
}

/** "shift" / "shifts" after a figure, following the live value rather than the server's. */
const unitFor = (n: number, unit?: [string, string]) => (unit ? ` ${n === 1 ? unit[0] : unit[1]}` : "");

/** One of today's totals, counting to each new value (with its unit word, if given). Falls back to `fallback` outside a provider. */
export function LiveFigure({ of, fallback, unit }: { of: keyof FieldTotals; fallback: number; unit?: [string, string] }) {
  const s = useFieldLive();
  const n = s ? s.today[of] : fallback;
  return (
    <>
      <CountUp value={n} />
      {unitFor(n, unit)}
    </>
  );
}

/** Renders its children only while one of today's totals is above zero (a "Doors" figure that has none yet stays out). */
export function LiveShow({ of, fallback, children }: { of: keyof FieldTotals; fallback: number; children: ReactNode }) {
  const s = useFieldLive();
  return (s ? s.today[of] : fallback) > 0 ? <>{children}</> : null;
}

/** "3 / 8": two of today's totals, each counting on its own. */
export function LiveRatio({ of, over, fallback }: { of: keyof FieldTotals; over: keyof FieldTotals; fallback: [number, number] }) {
  const s = useFieldLive();
  return (
    <>
      <CountUp value={s ? s.today[of] : fallback[0]} /> / <CountUp value={s ? s.today[over] : fallback[1]} />
    </>
  );
}

/** A ring filled by the share of one total in another (checked in over under way): from empty on load, then from where it was. */
export function LiveRing({ of, over, fallback, className }: { of: keyof FieldTotals; over: keyof FieldTotals; fallback: [number, number]; className?: string }) {
  const s = useFieldLive();
  const [a, b] = s ? [s.today[of], s.today[over]] : fallback;
  const fill = b > 0 ? ringFill(a / b) : 0;
  // The previous fill, kept as state so each change tweens from it (state adjusted while rendering, as React suggests).
  const [seen, setSeen] = useState(fill);
  const [from, setFrom] = useState(0);
  if (seen !== fill) {
    setFrom(seen);
    setSeen(fill);
  }
  return <Ring fill={fill} from={from} className={className} />;
}

/** One of a board group's totals (`key` as groupField keys them), with its unit word if given. */
export function LiveGroupFigure({ group, of, fallback, unit }: { group: string; of: Exclude<keyof GroupTotals, "key">; fallback: number; unit?: [string, string] }) {
  const s = useFieldLive();
  const g = s?.groups.find((x) => x.key === group);
  const n = g ? g[of] : fallback;
  return (
    <>
      <CountUp value={n} />
      {unitFor(n, unit)}
    </>
  );
}

/** One turf's live figure (#111, screen 11): the zone's shifts on the ground or in total, following the map's own summary. */
export function LiveZoneFigure({ id, of, fallback }: { id: string; of: "onGround" | "total"; fallback: number }) {
  const z = useFieldLive()?.zones.find((x) => x.id === id);
  return <CountUp value={z ? z[of] : fallback} />;
}

/** A turf card's bar: the share of its shifts on the ground now, as wide as that share. A zone the summary no longer carries shows the server's figures again. */
export function LiveZoneBar({ id, fallback }: { id: string; fallback: [number, number] }) {
  const z = useFieldLive()?.zones.find((x) => x.id === id);
  const [a, b] = z ? [z.onGround, z.total] : fallback;
  const pct = b > 0 ? Math.round((100 * a) / b) : 0;
  // A progress bar, not a picture: the figure beside it already says "a of b", so this carries only the share.
  return (
    <div className="turf-bar" role="progressbar" aria-label="Share on the ground" aria-valuemin={0} aria-valuemax={b} aria-valuenow={a}>
      <span className="turf-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
