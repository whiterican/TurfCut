import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AFFILIATIONS } from "@/lib/jobs";

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

  it("a native switch's 'on' track stands out from its white thumb and every surface (≥ 3:1)", () => {
    expect(ratio(t["switch-on"], "#ffffff")).toBeGreaterThanOrEqual(3);
    for (const s of SURFACES) expect(ratio(t["switch-on"], t[s])).toBeGreaterThanOrEqual(3);
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

  it("tab labels use the text colour the contrast check below assumes", () => {
    expect(css).toMatch(/\.tab \{[^}]*?text-fg[^}]*\}/);
    expect(css).not.toMatch(/\.tab \{[^}]*?text-muted[^}]*\}/);
  });

  it("the tab bar is paper: labels AAA on it, and lime type AAA on the current tab's eggplant tile", () => {
    // The frame is opaque paper (DESIGN.md: no glass); a translucent bar or header is caught here.
    expect(css).toMatch(/\.tabbar \{[^}]*?background: var\(--surface\);/);
    expect(css).toMatch(/\.site-header \{[^}]*?background: var\(--bg\);/);
    expect(css).toMatch(/\.eyebrow \{[^}]*?color: var\(--kicker\);/);
    expect(ratio(t.fg, t.surface)).toBeGreaterThanOrEqual(7);
    expect(ratio(t["tab-active-fg"], t["tab-active-bg"])).toBeGreaterThanOrEqual(7);
    // The tile is told apart from the bar by its lime type; its fill still differs visibly from the bar.
    expect(ratio(t["tab-active-bg"], t.surface)).toBeGreaterThanOrEqual(1.5);
  });

  it("the kicker reads on every surface (its lime dash is decorative: hue, not brightness, sets it apart)", () => {
    for (const k of SURFACES) expect(ratio(t.kicker, t[k])).toBeGreaterThanOrEqual(4.5);
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

describe("token plumbing", () => {
  it("every var(--x) without a fallback names a token the stylesheet (or next/font) defines", () => {
    // A var() of an undefined property makes its whole declaration invalid, silently: a removed token
    // must not leave a reference behind (it took the priority rings' shadow with it once).
    const defined = new Set([...css.matchAll(/--([\w-]+)\s*:/g)].map((m) => m[1]));
    const fromFonts = new Set(["font-barlow", "font-barlow-condensed", "font-dm-mono"]);
    const dangling = [...new Set([...css.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]))].filter((n) => !defined.has(n) && !fromFonts.has(n));
    expect(dangling).toEqual([]);
  });
});

describe("solid badges", () => {
  it("text on the solid fill (eggplant by day, olive by night) is AAA in both themes", () => {
    for (const th of [light, dark]) expect(ratio(th["on-solid"], th.solid)).toBeGreaterThanOrEqual(7);
  });
});

describe("party chips (job cards)", () => {
  // Every affiliation a job can declare (a new one fails here until it has a fill and a class).
  const PARTIES = AFFILIATIONS;
  it("every affiliation has its own fill, used by a badge class", () => {
    const fills = PARTIES.map((p) => light[`party-${p}`]);
    expect(fills.every(Boolean)).toBe(true);
    expect(new Set(fills).size).toBe(PARTIES.length);
    for (const p of PARTIES) expect(css).toMatch(new RegExp(`\\.badge-party-${p} \\{ --badge-bg: var\\(--party-${p}\\); \\}`));
  });
  it("party chips are filled by the pastel badge rule (ink text on --badge-bg)", () => {
    const rule = css.match(/:is\(([^)]*)\) \{\s*background: var\(--badge-bg\);/);
    expect(rule?.[1].split(",").map((x) => x.trim())).toContain(".badge-party");
  });
  it("ink on every party fill is AAA in both themes", () => {
    for (const th of [light, dark]) for (const p of PARTIES) expect(ratio(th.ink, th[`party-${p}`])).toBeGreaterThanOrEqual(7);
  });
  // By day the pastel chips sit close to the white card, like the other pastel
  // badges; that's not checked, since the party's name in the chip carries the
  // meaning (text contrast is checked above).
  it("by night each chip stands out from the eggplant card it sits on (≥ 3:1)", () => {
    for (const p of PARTIES) for (const s of SURFACES) expect(ratio(dark[`party-${p}`], dark[s])).toBeGreaterThanOrEqual(3);
  });
});

describe("the Turfcut App Mockup palette (eggplant and lime)", () => {
  it("dark mode uses the mockup's eggplant surfaces and lime accent", () => {
    expect(dark.bg).toBe("#120d18");
    expect(dark.surface).toBe("#23182f");
    expect(dark["surface-2"]).toBe("#30223f");
    expect(dark.accent).toBe("#d6f25a");
    expect(dark.solid).toBe("#d6f25a"); // live status by night: a lime chip
  });
  it("light mode uses the clipboard brand's warm paper, eggplant ink and lime accent (DESIGN.md)", () => {
    expect(light.bg).toBe("#efeae1");
    expect(light.fg).toBe("#1b1422");
    expect(light.accent).toBe("#d6f25a");
    expect(light.solid).toBe("#d6f25a"); // live status: a lime chip
    expect(light.hero).toBe("#3a2154");
    expect(light.primary).toBe("#2a173e");
    expect(light["on-primary"]).toBe("#d6f25a");
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
        else expect(["shadow", "shadow-depth"]).toContain(name); // the only non-colour tokens
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

