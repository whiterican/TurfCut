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
  const version = useRef(initial.version);
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
        setSummary(next);
        if (next.version !== version.current) {
          version.current = next.version;
          // Something about a shift changed: the names and badges under the figures re-render on the server.
          router.refresh();
        }
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

/** One of today's totals, counting to each new value. Falls back to `fallback` outside a provider. */
export function LiveFigure({ of, fallback }: { of: keyof FieldTotals; fallback: number }) {
  const s = useFieldLive();
  return <CountUp value={s ? s.today[of] : fallback} />;
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

/** A ring filled by the share of one total in another (checked in over under way). */
export function LiveRing({ of, over, fallback, className }: { of: keyof FieldTotals; over: keyof FieldTotals; fallback: [number, number]; className?: string }) {
  const s = useFieldLive();
  const [a, b] = s ? [s.today[of], s.today[over]] : fallback;
  return <Ring fill={b > 0 ? ringFill(a / b) : 0} from={0} className={className} />;
}

/** One of a board group's totals (`key` as groupField keys them). */
export function LiveGroupFigure({ group, of, fallback }: { group: string; of: Exclude<keyof GroupTotals, "key">; fallback: number }) {
  const s = useFieldLive();
  const g = s?.groups.find((x) => x.key === group);
  return <CountUp value={g ? g[of] : fallback} />;
}
