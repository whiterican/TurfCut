"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ring } from "@/components/Moments";
import { haptic } from "@/lib/haptics";
import { duration } from "@/lib/motion";
import { isInstalled, PULL_THRESHOLD_PX, pullOffset, pullRelease } from "@/lib/pull";

/**
 * Pull to refresh (P1.8), in the installed app only: a tab has the address
 * bar's reload. With the page at the top, dragging down brings a ring out
 * from under the header that fills as the finger travels; past the threshold
 * a tap of haptic says it will refresh, and letting go re-renders the page
 * on the server while the ring spins. Short of the threshold it springs
 * back. Touch only, so a mouse wheel or trackpad never trips it; a sideways
 * drag (a card swipe) and a drag inside a sheet, a map or a scrolled panel
 * are theirs, not ours.
 */

const subscribeNever = () => () => {};
/** Clearly downward: twice as far down as across. A card swipe is the other way round. */
const DOWNWARD = 2;
const DECIDE_PX = 4;

/** An ancestor that has scrolled: the drag belongs to it. */
function insideScrolled(el: Element | null): boolean {
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) if (n.scrollTop > 0) return true;
  return false;
}

export function PullToRefresh() {
  const router = useRouter();
  // Known only on the client: the server renders nothing, the phone reads its display mode once mounted.
  const installed = useSyncExternalStore(subscribeNever, isInstalled, () => false);
  const [offset, setOffset] = useState(0);
  const [refreshing, startRefresh] = useTransition();
  const [spinning, setSpinning] = useState(false);
  const [said, setSaid] = useState<"" | "Refreshing" | "Refreshed">("");
  const ring = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x0: number; y0: number; id: number; armed: boolean; pulling: boolean; offset: number } | null>(null);

  // The spinner stays until the server has answered, and for a moment at least so it reads as "refreshed" rather than a flicker.
  useEffect(() => {
    if (refreshing || !spinning) return;
    const t = window.setTimeout(() => {
      setSpinning(false);
      setSaid("Refreshed");
      settle(PULL_THRESHOLD_PX);
    }, Math.max(duration("slow"), 160));
    return () => window.clearTimeout(t);
  }, [refreshing, spinning]);

  // "Refreshed" is said once, then the live region empties so the next refresh is announced again.
  useEffect(() => {
    if (said !== "Refreshed") return;
    const t = window.setTimeout(() => setSaid(""), 1500);
    return () => window.clearTimeout(t);
  }, [said]);

  /** Slides the ring back under the header (fading at the end, where no header hides it). */
  function settle(from: number) {
    setOffset(0);
    const el = ring.current;
    const ms = duration("slow");
    if (!el || !ms || !from) return;
    const easing = getComputedStyle(document.documentElement).getPropertyValue("--spring").trim() || undefined;
    el.animate(
      [
        { translate: `0 ${from}px`, opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.7 },
        { translate: "0 0", opacity: 0, offset: 1 },
      ],
      { duration: ms, easing }
    );
  }

  useEffect(() => {
    if (!installed) return;
    const atTop = () => (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;
    const onStart = (e: TouchEvent) => {
      if (spinning || e.touches.length !== 1 || !atTop()) return;
      // A drag that starts inside a sheet, a map, a scrolled panel or anything marked data-no-pull is theirs.
      const t = e.target as Element | null;
      if (t?.closest("dialog, .turf-map, [data-no-pull]") || insideScrolled(t)) return;
      touch.current = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, id: e.touches[0].identifier, armed: false, pulling: false, offset: 0 };
    };
    const onMove = (e: TouchEvent) => {
      const d = touch.current;
      if (!d) return;
      const t = [...e.touches].find((x) => x.identifier === d.id);
      if (!t) return;
      const dy = t.clientY - d.y0;
      const dx = Math.abs(t.clientX - d.x0);
      if (!d.pulling) {
        // Upward, sideways (a card swipe), or the page has scrolled meanwhile: not a pull.
        if (dy < 0 || dx * DOWNWARD > Math.max(dy, DECIDE_PX) || !atTop()) {
          touch.current = null;
          return;
        }
        if (dy < DECIDE_PX) return;
        d.pulling = true;
      }
      // Ours now, from the first clear move: the page must not rubber-band or scroll under the finger
      // (a browser locks a touch into scrolling on the first move it is allowed).
      if (e.cancelable) e.preventDefault();
      const o = pullOffset(dy);
      d.offset = o;
      setOffset(o);
      if (!d.armed && o >= PULL_THRESHOLD_PX) {
        d.armed = true;
        haptic("tap");
      } else if (d.armed && o < PULL_THRESHOLD_PX) d.armed = false;
    };
    const ours = (e: TouchEvent, d: { id: number }) => [...e.changedTouches].some((x) => x.identifier === d.id);
    const onEnd = (e: TouchEvent) => {
      const d = touch.current;
      if (!d || !ours(e, d)) return;
      touch.current = null;
      if (!d.pulling) return;
      if (pullRelease(d.offset) === "refresh") {
        setOffset(PULL_THRESHOLD_PX);
        setSpinning(true);
        setSaid("Refreshing");
        startRefresh(() => router.refresh());
      } else settle(d.offset);
    };
    // The browser took the touch (a system gesture): nothing refreshes, the ring springs back.
    const onCancel = (e: TouchEvent) => {
      const d = touch.current;
      if (!d || !ours(e, d)) return;
      touch.current = null;
      if (d.pulling) settle(d.offset);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onCancel);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };
  }, [installed, spinning, router]);

  if (!installed) return null;
  const fill = Math.min(1, offset / PULL_THRESHOLD_PX);
  return (
    <div ref={ring} className={spinning ? "pull pull-spin" : "pull"} style={{ translate: `0 ${offset}px`, opacity: offset ? 1 : 0 }} role="status">
      <Ring fill={spinning ? 0.75 : fill} size={28} />
      {said && <span className="sr-only">{said}</span>}
    </div>
  );
}
