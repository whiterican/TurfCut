"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { clampScroll, isScrolled, photoPassed, scrollDirection, type ScrollDir } from "@/lib/scroll-direction";

/**
 * Marks the root with the way the page is being scrolled (data-scroll="down" | "up"), so the top
 * row can step aside on the way down and come back on the way up (Caden, Nov 12; globals.css).
 * It also marks whether the page has left its top (data-scrolled): the glass across the top of the screen
 * shows only then (Caden, Nov 14), so at rest it never sits over a photograph or a page's own buttons.
 * And whether a job's photograph has passed under the top of the screen (data-past-photo): the clear pane
 * over the photograph gives way to the page's own glass then. Read again when the page changes, since a new
 * page arrives at its top with no scroll to say so.
 * One passive listener, read once a frame. Renders nothing.
 */
export function ScrollDirection() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    const at = () => clampScroll(window.scrollY, root.scrollHeight - window.innerHeight);
    let last = at();
    let dir: ScrollDir = "up";
    let frame = 0;
    const mark = (now: number) => {
      // Written only on a change: an attribute set every frame would restyle the page every frame.
      const is = isScrolled(now);
      if (is !== "scrolled" in root.dataset) {
        if (is) root.dataset.scrolled = "";
        else delete root.dataset.scrolled;
      }
      const photo = document.querySelector(".job-photo-head");
      const past = photoPassed(photo ? photo.getBoundingClientRect().bottom : null);
      if (past !== "pastPhoto" in root.dataset) {
        if (past) root.dataset.pastPhoto = "";
        else delete root.dataset.pastPhoto;
      }
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
    // Going back restores the scroll in steps while the page is still arriving: read once more when it has settled.
    const settled = window.setTimeout(() => mark(at()), 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(settled);
      if (frame) cancelAnimationFrame(frame);
      delete root.dataset.scroll;
      delete root.dataset.scrolled;
      delete root.dataset.pastPhoto;
    };
  }, [pathname]);
  return null;
}
