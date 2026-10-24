"use client";

import { useSyncExternalStore } from "react";
import { SunMedium } from "lucide-react";
import { DISPLAY_EVENT, leaveSunlight, setTheme } from "@/lib/theme";

/**
 * The field-day screen's Sunlight switch (P1.5): one tap to the outdoor
 * theme, one tap back to the theme it replaced. The same store Display
 * settings uses. Its pressed look comes from CSS (.sun .sun-toggle), so a page
 * loaded in Sunlight paints it pressed from the first frame.
 */
const subscribe = (cb: () => void) => {
  window.addEventListener(DISPLAY_EVENT, cb);
  return () => window.removeEventListener(DISPLAY_EVENT, cb);
};
const isSun = () => document.documentElement.classList.contains("sun");

export function SunlightToggle() {
  const on = useSyncExternalStore(subscribe, isSun, () => false);
  return (
    <button type="button" onClick={() => (isSun() ? leaveSunlight() : setTheme("sun"))} aria-pressed={on} className="btn-secondary btn-sm sun-toggle">
      <SunMedium aria-hidden className="btn-icon" />
      Sunlight
    </button>
  );
}
