"use client";

import { useEffect } from "react";
import { scrollDirection, type ScrollDir } from "@/lib/scroll-direction";

/**
 * Marks the root with the way the page is being scrolled (data-scroll="down" | "up"), so the top-bar
 * buttons can step aside on the way down and come back on the way up (Caden, Nov 12; globals.css).
 * One passive listener, read once a frame. Renders nothing.
 */
export function ScrollDirection() {
  useEffect(() => {
    const root = document.documentElement;
    let last = window.scrollY;
    let dir: ScrollDir = "up";
    let frame = 0;
    const read = () => {
      frame = 0;
      const now = window.scrollY;
      const next = scrollDirection(last, now, dir);
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
