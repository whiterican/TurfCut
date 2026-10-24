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
 * back. Touch only, so a mouse wheel or trackpad never trips it.
 */
const subscribeNever = () => () => {};

export function PullToRefresh() {
  const router = useRouter();
  // Known only on the client: the server renders nothing, the phone reads its display mode once mounted.
  const installed = useSyncExternalStore(subscribeNever, isInstalled, () => false);
  const [offset, setOffset] = useState(0);
  const [refreshing, startRefresh] = useTransition();
  const [spinning, setSpinning] = useState(false);
  const ring = useRef<HTMLDivElement>(null);
  const touch = useRef<{ y0: number; id: number; armed: boolean; pulling: boolean } | null>(null);
  const offsetRef = useRef(0);
  offsetRef.current = offset;

  // The spinner stays until the server has answered, and for a moment at least so it reads as "refreshed" rather than a flicker.
  useEffect(() => {
    if (refreshing) return;
    if (!spinning) return;
    const t = window.setTimeout(() => {
      setSpinning(false);
      settle(offsetRef.current);
    }, Math.max(duration("slow"), 160));
    return () => window.clearTimeout(t);
  }, [refreshing, spinning]);

  /** Slides the ring back under the header. */
  function settle(from: number) {
    setOffset(0);
    const el = ring.current;
    const ms = duration("slow");
    if (!el || !ms || !from) return;
    const easing = getComputedStyle(document.documentElement).getPropertyValue("--spring").trim() || undefined;
    el.animate([{ translate: `0 ${from}px` }, { translate: "0 0" }], { duration: ms, easing });
  }

  useEffect(() => {
    if (!installed) return;
    const atTop = () => (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;
    const onStart = (e: TouchEvent) => {
      if (spinning || e.touches.length !== 1 || !atTop()) return;
      // A drag that starts inside a sheet, a map or a scrolling panel is theirs.
      const t = e.target as Element | null;
      if (t?.closest("dialog, .turf-map, [data-no-pull]")) return;
      touch.current = { y0: e.touches[0].clientY, id: e.touches[0].identifier, armed: false, pulling: false };
    };
    const onMove = (e: TouchEvent) => {
      const d = touch.current;
      if (!d) return;
      const t = [...e.touches].find((x) => x.identifier === d.id);
      if (!t) return;
      const dy = t.clientY - d.y0;
      if (!d.pulling) {
        // Upward, or the page has scrolled meanwhile: not a pull.
        if (dy <= 0 || !atTop()) {
          touch.current = null;
          return;
        }
        if (pullOffset(dy) === 0) return;
        d.pulling = true;
      }
      // Ours now: the page must not rubber-band or scroll under the finger.
      if (e.cancelable) e.preventDefault();
      const o = pullOffset(dy);
      setOffset(o);
      if (!d.armed && o >= PULL_THRESHOLD_PX) {
        d.armed = true;
        haptic("tap");
      } else if (d.armed && o < PULL_THRESHOLD_PX) d.armed = false;
    };
    const onEnd = () => {
      const d = touch.current;
      touch.current = null;
      if (!d?.pulling) return;
      const o = offsetRef.current;
      if (pullRelease(o) === "refresh") {
        setOffset(PULL_THRESHOLD_PX);
        setSpinning(true);
        startRefresh(() => router.refresh());
      } else settle(o);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [installed, spinning, router]);

  if (!installed) return null;
  const fill = Math.min(1, offset / PULL_THRESHOLD_PX);
  return (
    <div ref={ring} className={spinning ? "pull pull-spin" : "pull"} style={{ translate: `0 ${offset}px`, opacity: offset ? 1 : 0 }} role="status">
      <Ring fill={spinning ? 0.75 : fill} size={28} />
      {spinning && <span className="sr-only">Refreshing</span>}
    </div>
  );
}
