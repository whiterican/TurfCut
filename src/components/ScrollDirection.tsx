"use client";

import { useEffect } from "react";
import { clampScroll, scrollDirection, type ScrollDir } from "@/lib/scroll-direction";

/**
 * Marks the root with the way the page is being scrolled (data-scroll="down" | "up"), so the top
 * row can step aside on the way down and come back on the way up (Caden, Nov 12; globals.css).
 * One passive listener, read once a frame. Renders nothing.
 */
export function ScrollDirection() {
  useEffect(() => {
    const root = document.documentElement;
    const at = () => clampScroll(window.scrollY, root.scrollHeight - window.innerHeight);
    let last = at();
    let dir: ScrollDir = "up";
    let frame = 0;
    const read = () => {
      frame = 0;
      const now = at();
      const next = scrollDirection(last, now);
      if (next === null) return;
      last = now;
      if (next !== dir) {
        dir = next;
        document.documentElement.dataset.scroll = dir;
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      delete root.dataset.scroll;
    };
  }, []);
  return null;
}
