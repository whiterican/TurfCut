"use client";

import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Light/dark switch. The current theme lives on <html class="dark">, so the
 * icon and label are chosen by CSS — nothing theme-dependent is rendered in
 * React, which keeps hydration mismatch-free.
 */
export function ThemeToggle() {
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Storage unavailable (private mode): the choice lasts for this page.
    }
    window.dispatchEvent(new Event("turfcut-display")); // keep Display settings in step
  }

  return (
    <button type="button" onClick={toggle} className="btn-ghost btn-sm gap-1.5" title="Switch light / dark mode">
      <Moon aria-hidden className="btn-icon dark:hidden" />
      <Sun aria-hidden className="btn-icon hidden dark:block" />
      <span className="sr-only sm:not-sr-only dark:hidden">Dark mode</span>
      <span className="sr-only hidden sm:not-sr-only dark:inline">Light mode</span>
    </button>
  );
}
