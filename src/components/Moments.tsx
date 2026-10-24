"use client";

import { useEffect, useRef, useState } from "react";
import { duration } from "@/lib/motion";
import { countAt, morphsToPaid, ringFill, type PillState } from "@/lib/moments";
import { statusLabel } from "@/lib/pay";

/**
 * P1.4's field-worker moments: numbers that count up by the change, rings
 * that fill, the connection pill, and the paid badge. All motion reads the
 * tokens and stops under "Less motion"; nothing here is decorative noise
 * (no confetti), and screen readers get the settled value, never the tween.
 */

/** What this phone last saw, for a moment that should play once (per device; may be unavailable). */
const SEEN = "turfcut-seen:";
function readSeen(key: string): string | null {
  try {
    return localStorage.getItem(SEEN + key);
  } catch {
    return null;
  }
}
function writeSeen(key: string, value: string) {
  try {
    localStorage.setItem(SEEN + key, value);
  } catch {
    // private mode or full storage: the moment just plays again next time
  }
}

/** A number that counts from what was shown to its new value, by whole steps. */
export function CountUp({ value, format = String }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    const ms = duration("slow");
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = ms ? (now - t0) / ms : 1;
      const v = countAt(from, value, t);
      current.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}

/**
 * A ring that fills to `fill` (0..1). With `seenKey` it fills from what this
 * phone last saw (or from empty the first time) and remembers the new value;
 * otherwise from `from`. Decorative: the figure beside it carries the value.
 */
export function Ring({ fill, from, seenKey, size = 44, className = "" }: { fill: number; from?: number; seenKey?: string; size?: number; className?: string }) {
  const target = ringFill(fill);
  const [shown, setShown] = useState(from === undefined ? target : ringFill(from));
  useEffect(() => {
    const start = seenKey ? Number(readSeen(seenKey) ?? "0") : null;
    // Drawn at the start first, then moved to the target on the next frame, so the CSS transition runs.
    const raf = requestAnimationFrame(() => {
      if (start !== null) setShown(ringFill(start));
      requestAnimationFrame(() => {
        setShown(target);
        if (seenKey) writeSeen(seenKey, String(target));
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [target, seenKey]);
  return (
    <svg className={`progress-ring ${className}`} width={size} height={size} viewBox="0 0 44 44" aria-hidden="true" focusable="false">
      <circle className="progress-ring-track" cx="22" cy="22" r="18" />
      <circle className="progress-ring-fill" cx="22" cy="22" r="18" pathLength={1} style={{ strokeDashoffset: 1 - shown }} />
    </svg>
  );
}

const PILL_TONE: Record<PillState, string> = {
  online: "badge-neutral",
  offline: "badge-butter",
  syncing: "badge-sky",
  waiting: "badge-sky",
  refused: "badge-coral",
};

/** The field-day card's connection pill: its words slide in when the state changes, its colour follows. */
export function ConnectionPill({ state, text }: { state: PillState; text: string }) {
  return (
    <span role="status" className={`pill ${PILL_TONE[state]}`} data-state={state}>
      <span key={state} className="pill-face">
        {state === "syncing" && <span className="btn-spinner" aria-hidden="true" />}
        {text}
      </span>
    </span>
  );
}

const BADGE_BG: Record<string, string> = {
  "badge-sky": "var(--sky)",
  "badge-accent": "var(--accent)",
  "badge-butter": "var(--butter)",
  "badge-coral": "var(--coral)",
};

/**
 * A pay line's status badge. When this phone last saw the line on its way
 * and it's now paid, the badge morphs once from the old colour, with a check
 * drawn in: a plain moment, no celebration.
 */
export function PayBadge({ lineId, status, amountCents }: { lineId: string; status: string; amountCents: number }) {
  const { label, badge } = statusLabel(status as Parameters<typeof statusLabel>[0], amountCents);
  const [fromBg, setFromBg] = useState<string | null>(null);
  useEffect(() => {
    const key = `pay:${lineId}`;
    const prev = readSeen(key);
    if (!morphsToPaid(prev, status)) {
      writeSeen(key, status);
      return;
    }
    // Decided and remembered in the frame, so a dev double-run of the effect can't eat the moment.
    const raf = requestAnimationFrame(() => {
      writeSeen(key, status);
      setFromBg(BADGE_BG[statusLabel(prev as Parameters<typeof statusLabel>[0], amountCents).badge] ?? null);
    });
    return () => cancelAnimationFrame(raf);
  }, [lineId, status, amountCents]);
  return (
    <span className={`${badge}${fromBg ? " pay-morph" : ""}`} style={fromBg ? ({ "--from-bg": fromBg } as React.CSSProperties) : undefined}>
      {fromBg && (
        <svg className="btn-check" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 8.5l3.2 3L13 4.5" pathLength={1} />
        </svg>
      )}
      {label}
    </span>
  );
}
