"use client";

import { useEffect } from "react";
import { clampScroll, isScrolled, scrollDirection, type ScrollDir } from "@/lib/scroll-direction";

/**
 * Marks the root with the way the page is being scrolled (data-scroll="down" | "up"), so the top
 * row can step aside on the way down and come back on the way up (Caden, Nov 12; globals.css).
 * It also marks whether the page has left its top (data-scrolled): the glass across the top of the screen
 * shows only then (Caden, Nov 14), so at rest it never sits over a photograph or a page's own buttons.
 * One passive listener, read once a frame. Renders nothing.
 */
export function ScrollDirection() {
  useEffect(() => {
    const root = document.documentElement;
    const at = () => clampScroll(window.scrollY, root.scrollHeight - window.innerHeight);
    let last = at();
    let dir: ScrollDir = "up";
    let frame = 0;
    let moved = false;
    const mark = (now: number) => {
      const is = isScrolled(now);
      if (is === moved) return;
      moved = is;
      if (is) root.dataset.scrolled = "";
      else delete root.dataset.scrolled;
    };
    const read = () => {
      frame = 0;
      const now = at();
      mark(now);
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
    // A reload can restore the page part-way down, with no scroll to announce it.
    mark(last);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      delete root.dataset.scroll;
      delete root.dataset.scrolled;
    };
  }, []);
  return null;
}
