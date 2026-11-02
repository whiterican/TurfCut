"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { followOtherTabs, setTheme } from "@/lib/theme";

/**
 * The header's light/dark switch. The theme lives on <html> as classes
 * ("dark", or "sun" for Sunlight), so the icon and label are chosen by CSS:
 * nothing theme-dependent is rendered in React, which keeps hydration clean.
 * From Sunlight it goes to dark, like from light: the label names the theme
 * it switches to. It is on every page, so it also follows other tabs.
 * `iconOnlyWide`: beside the worker's desktop nav the bar has no room for the
 * words, so from 1024 the label stays the button's name and tooltip only.
 */
export function ThemeToggle({ iconOnlyWide = false }: { iconOnlyWide?: boolean }) {
  const wide = iconOnlyWide ? " lg:sr-only" : "";
  useEffect(followOtherTabs, []);
  return (
    <button type="button" onClick={() => setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark")} className="btn-ghost btn-sm glass-orb-phone gap-1.5" title="Switch light / dark mode">
      <Moon aria-hidden className="btn-icon dark:hidden" />
      <Sun aria-hidden className="btn-icon hidden dark:block" />
      <span className={`sr-only whitespace-nowrap! sm:not-sr-only dark:hidden${wide}`}>Dark mode</span>
      <span className={`sr-only hidden whitespace-nowrap! sm:not-sr-only dark:inline${wide}`}>Light mode</span>
    </button>
  );
}
