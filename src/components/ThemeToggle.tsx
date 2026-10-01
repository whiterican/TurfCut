"use client";

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
  }

  return (
    <button type="button" onClick={toggle} className="btn-ghost btn-sm gap-1.5" title="Switch light / dark mode">
      {/* Moon: shown in light mode */}
      <svg aria-hidden viewBox="0 0 24 24" className="size-4 dark:hidden" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
      {/* Sun: shown in dark mode */}
      <svg aria-hidden viewBox="0 0 24 24" className="hidden size-4 dark:block" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <span className="sr-only sm:not-sr-only dark:hidden">Dark mode</span>
      <span className="sr-only hidden sm:not-sr-only dark:inline">Light mode</span>
    </button>
  );
}
