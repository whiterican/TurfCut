/** Where the visitor's explicit light/dark choice is remembered. */
export const THEME_STORAGE_KEY = "turfcut-theme";
/** Where the visitor's text-size choice is remembered (this device only). */
export const TEXT_SIZE_KEY = "turfcut-text";

export const TEXT_SIZES = [
  { value: "md", label: "Default" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large" },
] as const;
export type TextSize = (typeof TEXT_SIZES)[number]["value"];

/**
 * Runs before first paint: the saved theme wins, otherwise follow the OS
 * preference (dark if unavailable); the saved text size is applied as
 * <html data-text>, which scales every rem-based size.
 */
export const THEME_INIT_SCRIPT = `(function(){var d=true;try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});d=t?t==="dark":!window.matchMedia("(prefers-color-scheme: light)").matches;var s=localStorage.getItem(${JSON.stringify(
  TEXT_SIZE_KEY
)});if(s==="lg"||s==="xl")document.documentElement.dataset.text=s;}catch(e){}document.documentElement.classList.toggle("dark",d);})();`;
