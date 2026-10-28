"use client";

import { useEffect, useRef, useState } from "react";
import { duration } from "@/lib/motion";
import { countAt, morphsToPaid, ringFill, type PillState } from "@/lib/moments";
import { statusLabel, type PayoutReadiness, type PayStatus } from "@/lib/pay";
import { syncStatus, type StatusState } from "@/lib/status";
import { StatusGlyph } from "@/components/StatusBadge";

const FINAL = new Set<PayStatus>(["PAID", "VOIDED", "NOTHING_DUE"]);

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
function forgetSeen(key: string) {
  try {
    localStorage.removeItem(SEEN + key);
  } catch {
    // nothing to forget
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
 * phone last saw (or from empty the first time) and remembers the new value
 * once the fill has played; with `from` it fills from there; otherwise it is
 * simply drawn. The markup always holds the final value, so the server, a
 * screen reader and Less motion all see the settled ring. Decorative.
 */
export function Ring({ fill, from, seenKey, size = 44, className = "" }: { fill: number; from?: number; seenKey?: string; size?: number; className?: string }) {
  const target = ringFill(fill);
  const el = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const node = el.current;
    const seen = seenKey ? readSeen(seenKey) : null;
    const start = seenKey ? ringFill(seen === null ? 0 : Number(seen)) : from === undefined ? null : ringFill(from);
    const remember = () => {
      if (seenKey) writeSeen(seenKey, String(target));
    };
    const ms = duration("slow");
    if (!node || start === null || start === target || !ms || typeof node.animate !== "function") {
      remember();
      return;
    }
    const easing = getComputedStyle(document.documentElement).getPropertyValue("--ease-out").trim() || undefined;
    const anim = node.animate([{ strokeDashoffset: 1 - start }, { strokeDashoffset: 1 - target }], { duration: ms, easing });
    // Remembered only once it has played, so a cancelled run (a dev double effect, a quick unmount) plays again.
    anim.finished.then(remember, () => {});
    return () => anim.cancel();
  }, [target, from, seenKey]);
  return (
    <svg className={`progress-ring ${className}`} width={size} height={size} viewBox="0 0 44 44" aria-hidden="true" focusable="false">
      <circle className="progress-ring-track" cx="22" cy="22" r="18" />
      <circle ref={el} className="progress-ring-fill" cx="22" cy="22" r="18" pathLength={1} style={{ strokeDashoffset: 1 - target, strokeOpacity: target === 0 ? 0 : 1 }} />
    </svg>
  );
}

/** The field-day card's connection pill: its words slide in when the state changes; its status (glyph and colour) follows. */
export function ConnectionPill({ state, text, waiting }: { state: PillState; text: string; /** Entries not yet sent; with none, no signal isn't "queued". */ waiting?: number }) {
  const s = syncStatus(state, text, waiting);
  return (
    <span role="status" className={`pill status status-${s.state}`} data-state={state}>
      <span key={state} className="pill-face">
        {state === "syncing" ? <span className="btn-spinner" aria-hidden="true" /> : <StatusGlyph state={s.state} />}
        {s.label}
      </span>
    </span>
  );
}

/** The fill a pay chip had before it turned paid, for the one-time morph. */
const MORPH_FROM: Partial<Record<StatusState, string>> = {
  sending: "color-mix(in srgb, var(--sky) 45%, var(--surface))",
  approved: "var(--surface)",
  "approved-blocked": "var(--surface)",
  pending: "var(--surface)",
};

/**
 * A pay line's status badge. When this phone last saw the line on its way
 * and it's now paid, the badge morphs once from the old colour, with a check
 * drawn in: a plain moment, no celebration.
 */
export function PayBadge({ lineId, status, amountCents, payouts }: { lineId: string; status: PayStatus; amountCents: number; /** Whether approved pay can reach the worker, when known. */ payouts?: PayoutReadiness }) {
  const { label, state } = statusLabel(status, amountCents, { payouts });
  const [fromBg, setFromBg] = useState<string | null>(null);
  useEffect(() => {
    const key = `pay:${lineId}`;
    const prev = readSeen(key) as PayStatus | null;
    // A line that has reached the end of its road needs no memory: drop the key (storage is shared with the offline queue).
    const keep = () => (FINAL.has(status) ? forgetSeen(key) : writeSeen(key, status));
    if (!morphsToPaid(prev, status)) {
      keep();
      return;
    }
    // Decided and remembered in the frame, so a dev double-run of the effect can't eat the moment.
    const raf = requestAnimationFrame(() => {
      keep();
      setFromBg(MORPH_FROM[statusLabel(prev!, amountCents, { payouts }).state] ?? null);
    });
    return () => cancelAnimationFrame(raf);
  }, [lineId, status, amountCents, payouts]);
  return (
    <span className={`status status-${state}${fromBg ? " pay-morph" : ""}`} data-state={state} style={fromBg ? ({ "--from-bg": fromBg } as React.CSSProperties) : undefined}>
      {fromBg ? (
        <svg className="btn-check" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 8.5l3.2 3L13 4.5" pathLength={1} />
        </svg>
      ) : (
        <StatusGlyph state={state} />
      )}
      {label}
    </span>
  );
}
