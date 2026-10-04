import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PIN_CATEGORIES } from "@/lib/field-day";

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

/** Hue in degrees, or null for a grey too unsaturated to have one. */
function hueOf(hex: string): number | null {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (sat < 0.12) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
/** Yellow-green through green to teal-green. */
const isGreen = (hex: string) => {
  const h = hueOf(hex);
  return h !== null && h >= 70 && h <= 185;
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
  it("accent next-shift card (gold by day, lilac by night): title AAA, secondary text AAA", () => {
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
  it("by day the innermost ring stands out from the gold card (≥ 3:1)", () => {
    expect(ratio(light.ring, light.accent)).toBeGreaterThanOrEqual(3);
  });
  it("by night a page-coloured gap separates the rings from the lilac card", () => {
    // Cream on lilac is only about 1.3:1, so the card's border takes the page colour.
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

describe("plum badges", () => {
  it("light text on solid plum is AAA in both themes", () => {
    for (const th of [light, dark]) expect(ratio(th["on-plum"], th.plum)).toBeGreaterThanOrEqual(7);
  });
});

describe("no green anywhere", () => {
  // Turfcut does not use green: not as an accent, a status, a ring or a map pin.
  it("no colour token in either theme has a green hue", () => {
    for (const [name, hex] of [...Object.entries(light), ...Object.entries(dark)]) {
      expect({ name, hex, green: isGreen(hex) }).toEqual({ name, hex, green: false });
    }
  });
  it("no map pin colour is green", () => {
    for (const c of PIN_CATEGORIES) expect({ pin: c.value, green: isGreen(c.color) }).toEqual({ pin: c.value, green: false });
  });
  it("the stylesheet has no leftover lime or mint tokens", () => {
    expect(css).not.toMatch(/--(lime|mint)\b/);
  });
});

describe("daytime trim", () => {
  it("warning text differs from error text by brightness, not only hue", () => {
    expect(ratio(light.warning, light.danger)).toBeGreaterThanOrEqual(1.5);
  });
  it("the eggplant trim around hero cards shows against the page (≥ 3:1)", () => {
    for (const s of ["bg", "surface"] as const) expect(ratio(light["hero-border"], light[s])).toBeGreaterThanOrEqual(3);
  });
  it("no deep dark gold: every gold token by day is light (owner's call)", () => {
    for (const [name, hex] of Object.entries(light)) {
      const h = hueOf(hex);
      const l = lum(rgb(hex));
      if (h !== null && h >= 25 && h <= 55) expect({ name, hex, deep: l < 0.35 }).toEqual({ name, hex, deep: false });
    }
  });
  it("the daytime accent is gold, not eggplant", () => {
    const h = hueOf(light.accent);
    expect(h).not.toBeNull();
    expect(h!).toBeGreaterThanOrEqual(35);
    expect(h!).toBeLessThanOrEqual(50);
  });
});

describe("no green in the source", () => {
  const root = join(__dirname, "../..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "zz-preview" && e.name !== "node_modules") walk(p);
      } else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) files.push(p);
    }
  };
  walk(join(root, "src"));
  files.push(join(root, "public/sw.js"));

  it("every token in the theme blocks was parsed (so the token checks see them all)", () => {
    for (const sel of [":root", ".dark"]) {
      const start = css.indexOf(`${sel} {`);
      const body = css.slice(start, css.indexOf("}", start));
      const names = [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)];
      const parsed = block(sel);
      for (const [, name, value] of names) {
        if (/^(#[0-9a-fA-F]{6})$/.test(value.trim())) expect(parsed[name]).toBe(value.trim());
        else if (name === "hero-border") expect(value.trim()).toBe("transparent");
        else expect(name).toBe("shadow"); // the only non-colour token
      }
    }
  });
  it("no hex colour literal anywhere in src or the service worker is green", () => {
    // #rgb, #rgba, #rrggbb and #rrggbbaa; in-page links (href="#…") and HTML entities (&#…) are not colours.
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/(?<![\w&]|href=["'])#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g)) {
        const d = m[1];
        const hex = d.length <= 4 ? `#${[...d.slice(0, 3)].map((c) => c + c).join("")}` : `#${d.slice(0, 6)}`;
        expect({ file: f.slice(root.length), hex, green: isGreen(hex) }).toEqual({ file: f.slice(root.length), hex, green: false });
      }
    }
  });
  it("stylesheets use no green colour functions or named greens", () => {
    const named = /(?<![\w-])(green|lime|teal|olive|seagreen|chartreuse|lawngreen|springgreen|forestgreen|darkgreen|limegreen|yellowgreen|olivedrab|aquamarine|mediumseagreen|darkseagreen|lightgreen|palegreen|darkolivegreen|mediumspringgreen|lightseagreen|darkcyan|turquoise|mediumturquoise|darkturquoise|mediumaquamarine|greenyellow|honeydew|mintcream)(?![\w-])/i;
    for (const f of files.filter((x) => x.endsWith(".css"))) {
      const text = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect({ file: f.slice(root.length), named: named.exec(text)?.[0] ?? null }).toEqual({ file: f.slice(root.length), named: null });
      for (const m of text.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g)) {
        const hex = "#" + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("");
        expect({ file: f.slice(root.length), rgb: m[0], green: isGreen(hex) }).toEqual({ file: f.slice(root.length), rgb: m[0], green: false });
      }
      // Colours are written as hex or rgb()/hsl() so these checks can read them.
      expect({ file: f.slice(root.length), fn: /\b(?:oklch|oklab|lab|lch|hwb|color)\(/.exec(text)?.[0] ?? null }).toEqual({ file: f.slice(root.length), fn: null });
      for (const m of text.matchAll(/hsla?\(\s*([\d.]+)/g)) {
        const h = Number(m[1]);
        expect({ file: f.slice(root.length), hsl: m[0], green: h >= 70 && h <= 185 }).toEqual({ file: f.slice(root.length), hsl: m[0], green: false });
      }
    }
  });
  it("no Tailwind green, emerald, teal or lime class is used", () => {
    const re = /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|shadow|accent|caret|divide)-(?:green|emerald|teal|lime)(?:-\d+)?\b/;
    for (const f of files) expect({ file: f.slice(root.length), hit: re.exec(readFileSync(f, "utf8"))?.[0] ?? null }).toEqual({ file: f.slice(root.length), hit: null });
  });
});
