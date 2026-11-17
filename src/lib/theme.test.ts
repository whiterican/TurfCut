import { afterEach, describe, expect, it, vi } from "vitest";
import { STRIP_COLORS, THEME_CHOICES, THEME_INIT_SCRIPT, currentTheme, leaveSunlight, setTheme, storedTheme, themeClasses } from "./theme";

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

  /** The theme-color tags the pre-paint script leaves: the server's two (light, dark), plus any it adds, in head order. */
  function stripTags(stored: string | null, phoneLight: boolean): Array<{ content: string; media?: string }> {
    type Tag = { name?: string; content: string; media?: string };
    const head: Tag[] = [
      { name: "theme-color", content: STRIP_COLORS.light, media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: STRIP_COLORS.dark, media: "(prefers-color-scheme: dark)" },
    ];
    const classList = { add: () => {}, toggle: () => {} };
    new Function("document", "localStorage", "window", THEME_INIT_SCRIPT)(
      {
        documentElement: { classList, dataset: {} },
        head: { firstChild: head[0], insertBefore: (n: Tag, before: Tag) => head.splice(head.indexOf(before), 0, n) },
        querySelectorAll: () => head.filter((t) => t.name === "theme-color"),
        createElement: () => ({ content: "" }),
      },
      { getItem: (k: string) => (k === "turfcut-theme" ? stored : null) },
      { matchMedia: () => ({ matches: phoneLight }) },
    );
    return head.map(({ content, media }) => ({ content, media }));
  }
  it("puts the chosen theme's strip colour first in theme-color before the page loads, whatever the phone's setting", () => {
    for (const phoneLight of [true, false]) {
      for (const [stored, want] of [["dark", STRIP_COLORS.dark], ["sun", STRIP_COLORS.sun], ["light", STRIP_COLORS.light]] as const) {
        const tags = stripTags(stored, phoneLight);
        // A tag with no media, first in the head, so it is the one a phone reads; the server's tags carry the same colour.
        expect(tags[0]).toEqual({ content: want, media: undefined });
        expect(tags.map((t) => t.content)).toEqual([want, want, want]);
      }
      // Match my phone: the phone's own colour.
      expect(stripTags(null, phoneLight)[0].content).toBe(phoneLight ? STRIP_COLORS.light : STRIP_COLORS.dark);
    }
  });
  it("still applies the theme when the head can't be touched", () => {
    const classes = new Set<string>();
    const classList = { add: (c: string) => classes.add(c), toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) };
    expect(() =>
      new Function("document", "localStorage", "window", THEME_INIT_SCRIPT)(
        { documentElement: { classList, dataset: {} } },
        { getItem: () => "dark" },
        { matchMedia: () => ({ matches: true }) },
      ),
    ).not.toThrow();
    expect([...classes]).toEqual(["dark"]);
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
