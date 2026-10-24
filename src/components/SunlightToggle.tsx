"use client";

import { useSyncExternalStore } from "react";
import { SunMedium } from "lucide-react";
import { BEFORE_SUN_KEY, THEME_STORAGE_KEY, applyThemeClasses, storedTheme } from "@/lib/theme";

/**
 * The field-day screen's Sunlight switch (P1.5): one tap to the outdoor
 * theme and one tap back to whatever was chosen before. The same choice
 * Display settings makes, saved on this device.
 */
const EVENT = "turfcut-display";
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
const isSun = () => document.documentElement.classList.contains("sun");

export function SunlightToggle() {
  const on = useSyncExternalStore(subscribe, isSun, () => false);
  function toggle() {
    let back = "system";
    try {
      if (on) {
        back = storedTheme(localStorage.getItem(BEFORE_SUN_KEY));
        if (back === "system") localStorage.removeItem(THEME_STORAGE_KEY);
        else localStorage.setItem(THEME_STORAGE_KEY, back);
        localStorage.removeItem(BEFORE_SUN_KEY);
      } else {
        const before = storedTheme(localStorage.getItem(THEME_STORAGE_KEY));
        if (before !== "system") localStorage.setItem(BEFORE_SUN_KEY, before);
        else localStorage.removeItem(BEFORE_SUN_KEY);
        localStorage.setItem(THEME_STORAGE_KEY, "sun");
      }
    } catch {
      // Storage unavailable: the switch lasts for this page.
    }
    applyThemeClasses(on ? storedTheme(back) : "sun");
    window.dispatchEvent(new Event(EVENT));
  }
  return (
    <button type="button" onClick={toggle} aria-pressed={on} className={on ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
      <SunMedium aria-hidden className="btn-icon" />
      Sunlight
    </button>
  );
}
