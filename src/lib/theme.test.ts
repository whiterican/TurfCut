import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_CHOICES, THEME_INIT_SCRIPT, currentTheme, leaveSunlight, setTheme, storedTheme, themeClasses } from "./theme";

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
  /** The classes the pre-paint script leaves for a stored value, on a light or dark phone. */
  function prepaint(stored: string | null, phoneLight: boolean): string[] {
    const classes = new Set<string>();
    const classList = { add: (c: string) => classes.add(c), toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) };
    new Function("document", "localStorage", "window", THEME_INIT_SCRIPT)(
      { documentElement: { classList, dataset: {} } },
      { getItem: (k: string) => (k === "turfcut-theme" ? stored : null) },
      { matchMedia: () => ({ matches: phoneLight }) },
    );
    return [...classes].sort();
  }
  it("applies every saved choice before first paint, the same way the controls read it, and never sun with dark", () => {
    for (const phoneLight of [true, false]) {
      expect(prepaint("sun", phoneLight)).toEqual(["sun"]);
      expect(prepaint("light", phoneLight)).toEqual([]);
      expect(prepaint("dark", phoneLight)).toEqual(["dark"]);
      // Nothing saved, or something unknown: follow the phone, like storedTheme() says.
      for (const v of [null, "glow"]) expect(prepaint(v, phoneLight)).toEqual(phoneLight ? [] : ["dark"]);
    }
  });
});

describe("the theme store every control shares", () => {
  function stubPage(storageWorks = true) {
    const classes = new Set<string>();
    const store: Record<string, string> = {};
    const events: string[] = [];
    vi.stubGlobal("document", { documentElement: { classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)), contains: (c: string) => classes.has(c) } } });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }), dispatchEvent: (e: Event) => events.push(e.type) });
    vi.stubGlobal("Event", class { constructor(public type: string) {} });
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => { if (!storageWorks) throw new Error("blocked"); return store[k] ?? null; },
      setItem: (k: string, v: string) => { if (!storageWorks) throw new Error("blocked"); store[k] = v; },
      removeItem: (k: string) => { if (!storageWorks) throw new Error("blocked"); delete store[k]; },
    });
    return { classes, store, events };
  }
  afterEach(() => vi.unstubAllGlobals());

  it("Dark, then Sunlight chosen in settings, then switched off on the field screen, lands on Dark", () => {
    const page = stubPage();
    setTheme("dark");
    setTheme("sun");
    expect([...page.classes]).toEqual(["sun"]);
    expect(page.store["turfcut-theme-before-sun"]).toBe("dark");
    leaveSunlight();
    expect([...page.classes]).toEqual(["dark"]);
    expect(currentTheme()).toBe("dark");
    expect(page.store["turfcut-theme-before-sun"]).toBeUndefined();
    expect(page.events.every((e) => e === "turfcut-display")).toBe(true);
  });

  it("switching off with nothing remembered, or a stray Sunlight remembered, goes to match-my-phone", () => {
    const page = stubPage();
    setTheme("sun");
    leaveSunlight();
    expect(currentTheme()).toBe("system");
    page.store["turfcut-theme"] = "sun";
    page.store["turfcut-theme-before-sun"] = "sun";
    leaveSunlight();
    expect(currentTheme()).toBe("system");
  });

  it("any other choice forgets what Sunlight replaced, and the controls read the saved choice, not memory", () => {
    const page = stubPage();
    setTheme("light");
    setTheme("sun");
    setTheme("dark");
    expect(page.store["turfcut-theme-before-sun"]).toBeUndefined();
    // Another control (or tab) cleared the saved theme: the store says so.
    delete page.store["turfcut-theme"];
    expect(currentTheme()).toBe("system");
  });

  it("without storage the choice lasts for the page, and Sunlight still goes back to what it replaced", () => {
    const page = stubPage(false);
    setTheme("dark");
    setTheme("sun");
    expect(currentTheme()).toBe("sun");
    leaveSunlight();
    expect(currentTheme()).toBe("dark");
    expect([...page.classes]).toEqual(["dark"]);
  });
});
