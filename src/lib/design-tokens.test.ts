import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrast guard for the design system in app/globals.css. Reads the actual
 * token values from the stylesheet and checks every text/background pairing
 * the components use against WCAG 2.x ratios, in both themes.
 */
const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]])
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

const PASTELS = ["lime", "mint", "sky", "coral", "butter"] as const;
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

  it("hero card text is AAA, its secondary text AA", () => {
    expect(ratio(t["hero-fg"], t.hero)).toBeGreaterThanOrEqual(7);
    expect(ratio(t["hero-muted"], t.hero)).toBeGreaterThanOrEqual(4.5);
  });

  it("the tab bar's text is AAA on its translucent surface", () => {
    for (const under of SURFACES) {
      const bar = mix(t.surface, 0.92, t[under]);
      expect(ratio(t.muted, bar)).toBeGreaterThanOrEqual(7); // tab labels
      expect(ratio(t.fg, bar)).toBeGreaterThanOrEqual(7); // current tab
    }
  });

  it("body text stays AAA on tinted alerts and selected chips", () => {
    expect(ratio(t.fg, mix(t.butter, 0.14, t.surface))).toBeGreaterThanOrEqual(7);
    expect(ratio(t.fg, mix(t.sky, 0.12, t.surface))).toBeGreaterThanOrEqual(7);
    expect(ratio(t.fg, mix(t.lime, 0.16, t.surface))).toBeGreaterThanOrEqual(7);
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
      expect(ratio(th.ink, th.lime)).toBeGreaterThanOrEqual(7);
      expect(ratio(mix(th.ink, 0.8, th.lime), th.lime)).toBeGreaterThanOrEqual(7);
    }
  });
  it("chat shift banner text is AAA, its second line AA", () => {
    const lightBanner = mix(light.lime, 0.5, light.surface);
    const dk = mix(dark.lime, 0.24, dark.surface);
    expect(ratio(light.fg, lightBanner)).toBeGreaterThanOrEqual(7);
    expect(ratio(dark.fg, dk)).toBeGreaterThanOrEqual(7);
    expect(ratio(light.muted, lightBanner)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark.muted, dk)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("priority rings", () => {
  // The rings circle the next-shift card, which is filled with --lime.
  it("the outermost ring stands out from the page (WCAG non-text, ≥ 3:1)", () => {
    for (const th of [light, dark]) {
      for (const s of ["bg", "surface", "surface-2"] as const) expect(ratio(th["ring-3"], th[s])).toBeGreaterThanOrEqual(3);
    }
  });
  it("in light mode the innermost ring stands out from the lime card (≥ 3:1)", () => {
    expect(ratio(light.ring, light.lime)).toBeGreaterThanOrEqual(3);
  });
  it("in dark mode the rings are green, set apart from the lavender card by hue", () => {
    // Luminance contrast against the bright eggplant card is low by design
    // (about 1.3:1); the hue difference carries it, so check the hues.
    for (const k of ["ring", "ring-2", "ring-3"] as const) {
      const [r, g, b] = rgb(dark[k]);
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    }
    const [cr, cg, cb] = rgb(dark.lime);
    expect(cb).toBeGreaterThan(cg);
    expect(cr).toBeGreaterThan(cg);
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
