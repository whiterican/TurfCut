"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Tells the phone what colour the strip behind the clock and battery is: the colour the root is
 * painted (globals.css), kept in <meta name="theme-color">. An installed iPhone app takes that
 * strip from the page once and does not look again, so after a change of theme the strip kept
 * the old theme's colour (Caden's iPhone, Nov 12: a light strip over the dark app).
 *
 * The root's colour changes with the theme (classes on the root), the page (a header or a chat),
 * and the menu drawer, so it is read again after each of those, once a frame. Renders nothing.
 */
export function StatusStripColor() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    // The layout sends one tag for the device's light theme and one for its dark (so a value is there at load):
    // every one is kept on the page's real colour, whichever the device is reading.
    const tags = () => {
      const found = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
      if (found.length) return found;
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
      return [meta];
    };
    let frame = 0;
    let timer = 0;
    // One pixel, to turn whatever the browser computed (it may be a color(srgb …) from a color-mix) into plain rgb().
    const pixel = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    let seen = "";
    let plain = "";
    const read = () => {
      frame = 0;
      const computed = getComputedStyle(root).backgroundColor;
      if (!computed) return;
      if (computed !== seen) {
        seen = computed;
        plain = computed;
        if (pixel) {
          // An unreadable colour leaves fillStyle as it was: start from a marker, and keep the browser's own string then.
          pixel.fillStyle = "#010203";
          pixel.fillStyle = computed;
          const taken = pixel.fillStyle !== "#010203" || /^rgb\(1, 2, 3\)$/.test(computed);
          if (taken) {
            pixel.clearRect(0, 0, 1, 1);
            pixel.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
            plain = a < 255 ? "" : `rgb(${r}, ${g}, ${b})`; // a see-through root says nothing about the strip
          }
        }
      }
      if (plain) for (const tag of tags()) if (tag.content !== plain) tag.content = plain;
    };
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    // A tap or a key can open the drawer or change the theme: read on the next frame, and once more when its motion has settled.
    const after = () => {
      soon();
      window.clearTimeout(timer);
      timer = window.setTimeout(soon, 400);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") after();
    };
    read();
    const watcher = new MutationObserver(soon);
    watcher.observe(root, { attributes: true, attributeFilter: ["class"] });
    // A header or a chat's bar that arrives after the page (streamed in) changes the root's colour with no event.
    const arrivals = new MutationObserver(soon);
    arrivals.observe(document.body, { childList: true, subtree: true });
    const phone = window.matchMedia("(prefers-color-scheme: light)");
    phone.addEventListener("change", after);
    window.addEventListener("click", after, { passive: true });
    window.addEventListener("keyup", key, { passive: true });
    window.addEventListener("pageshow", after);
    return () => {
      watcher.disconnect();
      arrivals.disconnect();
      phone.removeEventListener("change", after);
      window.removeEventListener("click", after);
      window.removeEventListener("keyup", key);
      window.removeEventListener("pageshow", after);
      window.clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);
  return null;
}
