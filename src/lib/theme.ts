/** Where the visitor's explicit light/dark choice is remembered. */
export const THEME_STORAGE_KEY = "turfcut-theme";

/**
 * Runs before first paint: the saved choice wins; otherwise follow the OS
 * preference. Falls back to dark (the primary theme) if storage or
 * matchMedia is unavailable.
 */
export const THEME_INIT_SCRIPT = `(function(){var d=true;try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});d=t?t==="dark":!window.matchMedia("(prefers-color-scheme: light)").matches;}catch(e){}document.documentElement.classList.toggle("dark",d);})();`;
