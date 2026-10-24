import { describe, expect, it } from "vitest";
import { THEME_CHOICES, THEME_INIT_SCRIPT, storedTheme, themeClasses } from "./theme";

describe("themes (P1.5 adds Sunlight)", () => {
  it("offers four choices, Sunlight among them", () => {
    expect(THEME_CHOICES.map((c) => c.value)).toEqual(["system", "light", "dark", "sun"]);
  });
  it("reads a stored choice safely", () => {
    expect(storedTheme("sun")).toBe("sun");
    expect(storedTheme("dark")).toBe("dark");
    expect(storedTheme("glow")).toBe("system");
    expect(storedTheme(null)).toBe("system");
  });
  it("Sunlight is light-based: never dark, whatever the phone says", () => {
    expect(themeClasses("sun", true)).toEqual({ dark: false, sun: true });
    expect(themeClasses("system", true)).toEqual({ dark: true, sun: false });
    expect(themeClasses("light", true)).toEqual({ dark: false, sun: false });
    expect(themeClasses("dark", false)).toEqual({ dark: true, sun: false });
  });
  it("applies a saved Sunlight before first paint, and never with dark", () => {
    const html = { classList: new Set<string>(), dataset: {} as Record<string, string> };
    const classList = { add: (c: string) => html.classList.add(c), toggle: (c: string, on: boolean) => (on ? html.classList.add(c) : html.classList.delete(c)) };
    const storage: Record<string, string> = { "turfcut-theme": "sun" };
    new Function("document", "localStorage", "window", THEME_INIT_SCRIPT)(
      { documentElement: { classList, dataset: html.dataset } },
      { getItem: (k: string) => storage[k] ?? null },
      { matchMedia: () => ({ matches: false }) },
    );
    expect([...html.classList].sort()).toEqual(["sun"]);
  });
});
