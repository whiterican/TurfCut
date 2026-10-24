import { MOTION_INIT_FRAGMENT } from "@/lib/motion";

/** Where the visitor's explicit theme choice is remembered: "light", "dark" or "sun" (absent = match the phone). */
export const THEME_STORAGE_KEY = "turfcut-theme";
/** The theme to go back to when Sunlight is switched off from the field-day header (this device only). */
export const BEFORE_SUN_KEY = "turfcut-theme-before-sun";

export type ThemeChoice = "system" | "light" | "dark" | "sun";
export const THEME_CHOICES: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: "system", label: "Match my phone" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "sun", label: "Sunlight" },
];

/** A stored theme value read safely: anything unknown means "match the phone". */
export function storedTheme(raw: string | null): ThemeChoice {
  return raw === "light" || raw === "dark" || raw === "sun" ? raw : "system";
}

/**
 * The classes a theme puts on <html>: "dark" for the dark theme (and for
 * "match my phone" on a dark phone), "sun" for Sunlight (P1.5), which is
 * built on the light theme and never carries "dark".
 */
export function themeClasses(choice: ThemeChoice, phoneIsDark: boolean): { dark: boolean; sun: boolean } {
  if (choice === "sun") return { dark: false, sun: true };
  return { dark: choice === "dark" || (choice === "system" && phoneIsDark), sun: false };
}

/** Puts a theme on the page now (the saved choice is the caller's business). */
export function applyThemeClasses(choice: ThemeChoice) {
  const phoneIsDark = !window.matchMedia("(prefers-color-scheme: light)").matches;
  const { dark, sun } = themeClasses(choice, phoneIsDark);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("sun", sun);
}
/** Where the visitor's text-size choice is remembered (this device only). */
export const TEXT_SIZE_KEY = "turfcut-text";

export const TEXT_SIZES = [
  { value: "md", label: "Default" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large" },
] as const;
export type TextSize = (typeof TEXT_SIZES)[number]["value"];

/**
 * Runs before first paint: the saved theme wins ("sun" is Sunlight, built on
 * light), otherwise follow the OS preference (dark if unavailable); the
 * saved text size is applied as
 * <html data-text>, which scales every rem-based size; the saved "Less
 * motion" choice as <html data-motion> (P1.1), so nothing animates on the
 * first page either.
 */
export const THEME_INIT_SCRIPT = `(function(){var d=true;try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});if(t==="sun")document.documentElement.classList.add("sun");d=t?t==="dark":!window.matchMedia("(prefers-color-scheme: light)").matches;var s=localStorage.getItem(${JSON.stringify(
  TEXT_SIZE_KEY
)});if(s==="lg"||s==="xl")document.documentElement.dataset.text=s;${MOTION_INIT_FRAGMENT}}catch(e){}document.documentElement.classList.toggle("dark",d);})();`;
