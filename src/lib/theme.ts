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

/** Fired whenever a display choice changes, so every control showing one re-reads it. */
export const DISPLAY_EVENT = "turfcut-display";

/**
 * The one theme store all three controls use (Display settings, the header
 * light/dark button, the field-day Sunlight switch). The saved choice is the
 * truth; memory stands in only when storage is unavailable.
 */
let memTheme: ThemeChoice = "system";
let memBeforeSun: ThemeChoice = "system";
let storageWorks = true;

function readKey(key: string): string | null | undefined {
  try {
    return localStorage.getItem(key);
  } catch {
    return undefined; // unavailable, not empty
  }
}
function writeKey(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    storageWorks = true;
  } catch {
    storageWorks = false;
  }
}

/** The theme chosen now: saved, else (only when storage fails) remembered for this page. */
export function currentTheme(): ThemeChoice {
  const saved = readKey(THEME_STORAGE_KEY);
  return saved === undefined || !storageWorks ? memTheme : storedTheme(saved);
}

/**
 * Chooses a theme everywhere at once: saves it, puts it on the page and tells
 * the controls. Choosing Sunlight remembers the theme it replaced, so switching
 * it off (from any control) goes back there; any other choice forgets that.
 */
export function setTheme(choice: ThemeChoice) {
  const before = currentTheme();
  if (choice === "sun") {
    if (before !== "sun") {
      memBeforeSun = before;
      writeKey(BEFORE_SUN_KEY, before === "system" ? null : before);
    }
  } else {
    memBeforeSun = "system";
    writeKey(BEFORE_SUN_KEY, null);
  }
  memTheme = choice;
  writeKey(THEME_STORAGE_KEY, choice === "system" ? null : choice);
  applyThemeClasses(choice);
  window.dispatchEvent(new Event(DISPLAY_EVENT));
}

/** Switches Sunlight off: back to the theme it replaced ("match my phone" if none, or if that was Sunlight too). */
export function leaveSunlight() {
  const saved = readKey(BEFORE_SUN_KEY);
  const back = saved === undefined || !storageWorks ? memBeforeSun : storedTheme(saved);
  setTheme(back === "sun" ? "system" : back);
}

/** Another tab changed the theme, or the phone did while "match my phone" is chosen: show it here too. */
export function followOtherTabs(): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY && e.key !== null) return;
    applyThemeClasses(currentTheme());
    window.dispatchEvent(new Event(DISPLAY_EVENT));
  };
  const phone = window.matchMedia("(prefers-color-scheme: light)");
  const onPhone = () => {
    if (currentTheme() === "system") applyThemeClasses("system");
  };
  window.addEventListener("storage", onStorage);
  phone.addEventListener("change", onPhone);
  return () => {
    window.removeEventListener("storage", onStorage);
    phone.removeEventListener("change", onPhone);
  };
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
 * The colour of each theme's page top (--page-top in globals.css; Sunlight's is its --bg), for the strip a
 * phone draws behind the clock and battery. The pre-paint script puts the chosen theme's colour in theme-color.
 */
export const STRIP_COLORS = { light: "#d6c9ea", dark: "#3c1f66", sun: "#fbf7f0" } as const;
/** The same, when the device asks for more contrast or less transparency: every page top is the flat --bg there. */
export const STRIP_COLORS_FLAT = { light: "#faf9f4", dark: "#140a22", sun: "#fbf7f0" } as const;
/** The stylesheet's query for those settings (globals.css), word for word. */
export const FLAT_STRIP_MEDIA = "(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)";

/**
 * Runs before first paint: the saved theme wins ("sun" is Sunlight, built on
 * light), otherwise follow the OS preference (dark if unavailable); the
 * saved text size is applied as
 * <html data-text>, which scales every rem-based size; the saved "Less
 * motion" choice as <html data-motion> (P1.1), so nothing animates on the
 * first page either.
 *
 * It also sets theme-color to the chosen theme's strip colour (the flat one under the contrast settings). The
 * server's tags follow the phone's light or dark setting, not the app's theme, and an iPhone reads the tag once,
 * as the page loads: a light phone with the app in dark or Sunlight kept the light strip over the page (Caden's
 * iPhone, Nov 17). The script adds a tag first in the head, which wins over any tag after it, and sets the tags
 * already parsed; tags the framework sends later carry the phone's colours until StatusStripColor rewrites them.
 * Known gap: a chat's strip is its flat --bg, not the page top, so an app opened straight into a chat starts
 * with the page-top colour there (it was the server's colour before; the script can't see the page).
 */
export const THEME_INIT_SCRIPT = `(function(){var d=true,u=false;try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});u=t==="sun";if(u)document.documentElement.classList.add("sun");d=t==="dark"||(t!=="light"&&t!=="sun"&&!window.matchMedia("(prefers-color-scheme: light)").matches);var s=localStorage.getItem(${JSON.stringify(
  TEXT_SIZE_KEY
)});if(s==="lg"||s==="xl")document.documentElement.dataset.text=s;${MOTION_INIT_FRAGMENT}}catch(e){}document.documentElement.classList.toggle("dark",d);try{var k=u?"sun":d?"dark":"light",c=(window.matchMedia(${JSON.stringify(
  FLAT_STRIP_MEDIA
)}).matches?${JSON.stringify(STRIP_COLORS_FLAT)}:${JSON.stringify(
  STRIP_COLORS
)})[k],m=document.querySelectorAll('meta[name="theme-color"]'),h=document.head,n=document.createElement("meta");for(var i=0;i<m.length;i++)m[i].content=c;n.name="theme-color";n.content=c;h.insertBefore(n,h.firstChild);}catch(e){}})();`;
