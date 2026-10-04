import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrast guard for the design system in app/globals.css. Reads the actual
 * token values from the stylesheet and checks every text/background pairing
 * the components use against WCAG 2.x ratios, in both themes.
 */
const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

/**
 * The body of the one top-level `selector {` block in the stylesheet, with
 * comments removed. Anchored to the start of a line and required to be
 * unique: a second `:root {` added anywhere (or `.dark {` inside another
 * rule) makes this throw instead of quietly testing the wrong block.
 */
function themeBody(source: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const opens = [...source.matchAll(new RegExp(`^${esc} \\{`, "gm"))];
  if (opens.length !== 1) throw new Error(`expected exactly one top-level "${selector} {" block, found ${opens.length}`);
  const start = opens[0].index! + opens[0][0].length;
  const end = source.indexOf("\n}", start);
  if (end < 0) throw new Error(`unclosed "${selector}" block`);
  return source.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");
}

function block(selector: string, source = css): Record<string, string> {
  return Object.fromEntries(
    [...themeBody(source, selector).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]])
  );
}

const light = block(":root");
const dark = { ...light, ...block(".dark") };

type RGB = [number, number, number];
const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
/** color-mix(in srgb, a p%, b) */
const mix = (a: string, p: number, b: string): RGB => {
  const [x, y] = [rgb(a), rgb(b)];
  return x.map((v, i) => v * p + y[i] * (1 - p)) as RGB;
};
const lum = (c: RGB) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: RGB | string, b: RGB | string) => {
  const [la, lb] = [lum(typeof a === "string" ? rgb(a) : a), lum(typeof b === "string" ? rgb(b) : b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const PASTELS = ["accent", "sky", "coral", "butter"] as const;
const SURFACES = ["bg", "surface", "surface-2", "field"] as const;

describe.each([
  ["dark", dark],
  ["light", light],
] as const)("%s theme contrast", (_name, t) => {
  it("body text is AAA (≥ 7:1) on every surface", () => {
    for (const s of SURFACES) expect(ratio(t.fg, t[s])).toBeGreaterThanOrEqual(7);
  });

  it("secondary text is AAA (≥ 7:1) and hint text well above AA (≥ 6:1) on every surface", () => {
    for (const s of SURFACES) {
      expect(ratio(t.muted, t[s])).toBeGreaterThanOrEqual(7);
      expect(ratio(t.subtle, t[s])).toBeGreaterThanOrEqual(6);
    }
  });

  it("the keyboard focus outline is visible on every surface (≥ 3:1)", () => {
    for (const s of SURFACES) expect(ratio(t.focus, t[s])).toBeGreaterThanOrEqual(3);
  });

  it("links and status text are AA on every surface", () => {
    for (const c of ["link", "danger", "success", "warning"] as const) {
      for (const s of SURFACES) expect(ratio(t[c], t[s])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("ink on every accent fill (light badges, current step) is AAA", () => {
    for (const p of PASTELS) expect(ratio(t.ink, t[p])).toBeGreaterThanOrEqual(7);
  });

  it("primary buttons and selected chips are AAA", () => {
    expect(ratio(t["on-primary"], t.primary)).toBeGreaterThanOrEqual(7);
  });

  it("hero card text is AAA, its secondary text too", () => {
    expect(ratio(t["hero-fg"], t.hero)).toBeGreaterThanOrEqual(7);
    expect(ratio(t["hero-muted"], t.hero)).toBeGreaterThanOrEqual(7);
  });

  it("secondary buttons: AAA text, an edge visible against the page (≥ 3:1), quieter than primary", () => {
    expect(ratio(t.fg, t.secondary)).toBeGreaterThanOrEqual(7);
    expect(ratio(t["secondary-border"], t.bg)).toBeGreaterThanOrEqual(3);
    expect(ratio(t["secondary-border"], t.secondary)).toBeGreaterThanOrEqual(3);
    // The primary fill stands out from the page more than the secondary fill does.
    expect(ratio(t.primary, t.bg)).toBeGreaterThan(ratio(t.secondary, t.bg));
  });

  it("the tab bar's text is AAA on its translucent surface, over anything it floats above", () => {
    // Read the bar's opacity from the stylesheet, so lowering it is caught here.
    const m = css.match(/\.tabbar \{[^}]*?background: color-mix\(in srgb, var\(--surface\) (\d+)%, transparent\)/);
    expect(m, "the .tabbar background is a surface/transparent mix").not.toBeNull();
    const alpha = Number(m![1]) / 100;
    // Floating, it can sit over photos and the map too: black and white are the worst cases.
    for (const under of [...SURFACES.map((s) => t[s]), "#000000", "#ffffff"]) {
      const bar = mix(t.surface, alpha, under);
      expect(ratio(t.muted, bar)).toBeGreaterThanOrEqual(7); // tab labels
      expect(ratio(t.fg, bar)).toBeGreaterThanOrEqual(7); // current tab
    }
  });

  it("body text stays AAA on tinted alerts and selected chips", () => {
    expect(ratio(t.fg, mix(t.butter, 0.14, t.surface))).toBeGreaterThanOrEqual(7);
    expect(ratio(t.fg, mix(t.sky, 0.12, t.surface))).toBeGreaterThanOrEqual(7);
    expect(ratio(t.fg, mix(t.accent, 0.16, t.surface))).toBeGreaterThanOrEqual(7);
  });
});

describe("dark theme accents", () => {
  it("solid badges (ink on pastel) are AAA in dark mode too", () => {
    for (const p of PASTELS) expect(ratio(dark.ink, dark[p])).toBeGreaterThanOrEqual(7);
  });
  it("accents used as text are AA on plain surfaces", () => {
    for (const p of PASTELS) {
      expect(ratio(dark[p], dark.surface)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(dark[p], dark.bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("mockup surfaces", () => {
  it("lime next-shift card: title AAA, secondary text AAA", () => {
    for (const th of [light, dark]) {
      expect(ratio(th.ink, th.accent)).toBeGreaterThanOrEqual(7);
      expect(ratio(mix(th.ink, 0.9, th.accent), th.accent)).toBeGreaterThanOrEqual(7);
    }
  });
  it("chat shift banner text is AAA, its second line AA", () => {
    const lightBanner = mix(light.accent, 0.5, light.surface);
    const dk = mix(dark.accent, 0.24, dark.surface);
    expect(ratio(light.fg, lightBanner)).toBeGreaterThanOrEqual(7);
    expect(ratio(dark.fg, dk)).toBeGreaterThanOrEqual(7);
    expect(ratio(light.muted, lightBanner)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark.muted, dk)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("priority rings", () => {
  // The rings circle the next-shift card, which is filled with --accent.
  it("the outermost ring stands out from the page (WCAG non-text, ≥ 3:1)", () => {
    for (const th of [light, dark]) {
      for (const s of ["bg", "surface", "surface-2"] as const) expect(ratio(th["ring-3"], th[s])).toBeGreaterThanOrEqual(3);
    }
  });
  it("by day the innermost ring stands out from the lime card (≥ 3:1)", () => {
    expect(ratio(light.ring, light.accent)).toBeGreaterThanOrEqual(3);
  });
  it("by night a page-coloured gap separates the rings from the lime card", () => {
    // The pale inner ring is close to the lime card, so the card's border takes the page colour.
    expect(css).toMatch(/\.dark \.hero-card:is\(\[data-priority="1"\], \[data-priority="2"\], \[data-priority="3"\]\) \{\s*border-color: var\(--bg\);/);
    expect(ratio(dark.ring, dark.bg)).toBeGreaterThanOrEqual(3);
    for (const k of ["ring", "ring-2", "ring-3"] as const) expect(lum(rgb(dark[k]))).toBeGreaterThan(lum(rgb(dark.surface)));
  });
  it("a single ring (priority 1) stands out from the page (≥ 3:1)", () => {
    for (const th of [light, dark]) {
      for (const s of ["bg", "surface", "surface-2"] as const) expect(ratio(th.ring, th[s])).toBeGreaterThanOrEqual(3);
    }
  });
  it("each ring is darker than the one inside it", () => {
    for (const th of [light, dark]) {
      expect(lum(rgb(th["ring-2"]))).toBeLessThan(lum(rgb(th.ring)));
      expect(lum(rgb(th["ring-3"]))).toBeLessThan(lum(rgb(th["ring-2"])));
    }
  });
});

describe("solid badges", () => {
  it("text on the solid fill (eggplant by day, olive by night) is AAA in both themes", () => {
    for (const th of [light, dark]) expect(ratio(th["on-solid"], th.solid)).toBeGreaterThanOrEqual(7);
  });
});

describe("the Turfcut App Mockup palette (eggplant and lime)", () => {
  it("dark mode uses the mockup's eggplant surfaces and lime accent", () => {
    expect(dark.bg).toBe("#1c142c");
    expect(dark.surface).toBe("#281a3a");
    expect(dark["surface-2"]).toBe("#36264a");
    expect(dark.accent).toBe("#ccea96");
    expect(dark.solid).toBe("#3e4830"); // olive "verified" chip
  });
  it("light mode uses the mockup's off-white page, green-black ink and lime accent", () => {
    expect(light.bg).toBe("#eef0ea");
    expect(light.fg).toBe("#181e1a");
    expect(light.accent).toBe("#ccea96");
    expect(light.solid).toBe("#281a3a"); // eggplant "done" badge
  });
  it("progress fills (the success colour) show against surfaces in both themes (≥ 3:1)", () => {
    for (const th of [light, dark]) for (const k of ["surface", "surface-2"] as const) expect(ratio(th.success, th[k])).toBeGreaterThanOrEqual(3);
  });
  it("by night team avatars (olive) differ from people's avatars (raised eggplant)", () => {
    expect(css).toMatch(/\.dark \.avatar-team \{\s*background: var\(--solid\);/);
    expect(dark.solid).not.toBe(dark["surface-2"]);
  });
  it("warning text differs from error text by brightness, not only hue", () => {
    expect(ratio(light.warning, light.danger)).toBeGreaterThanOrEqual(1.5);
  });
  it("every token in the theme blocks was parsed (so the contrast checks see them all)", () => {
    for (const sel of [":root", ".dark"]) {
      const body = themeBody(css, sel);
      const parsed = block(sel);
      for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
        if (/^#[0-9a-fA-F]{6}$/.test(value.trim())) expect(parsed[name]).toBe(value.trim());
        else if (name === "hero-border") expect(value.trim()).toBe("transparent");
        else expect(name).toBe("shadow"); // the only non-colour token
      }
    }
  });
});

describe("the token parser itself", () => {
  const sheet = (extra = "") => `${extra}:root {\n  --bg: #ffffff;\n  /* --fake: #000000; not a token */\n}\n.dark {\n  --bg: #000000;\n}\n`;
  it("reads the one top-level block, ignoring tokens inside comments", () => {
    expect(block(":root", sheet())).toEqual({ bg: "#ffffff" });
    expect(block(".dark", sheet())).toEqual({ bg: "#000000" });
  });
  it("refuses a stylesheet with a second :root block instead of testing the wrong one", () => {
    expect(() => block(":root", sheet(":root {\n  --bg: #123456;\n}\n"))).toThrow(/exactly one/);
  });
  it("doesn't mistake a nested or prefixed selector for the theme block", () => {
    const nested = `@media print {\n  .dark { --bg: #111111; }\n}\n:root.x {\n  --bg: #222222;\n}\n` + sheet();
    expect(block(".dark", nested)).toEqual({ bg: "#000000" });
    expect(block(":root", nested)).toEqual({ bg: "#ffffff" });
  });
  it("the real stylesheet has exactly one of each", () => {
    expect(() => themeBody(css, ":root")).not.toThrow();
    expect(() => themeBody(css, ".dark")).not.toThrow();
  });
});

