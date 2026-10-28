import { readFileSync, readdirSync } from "node:fs";
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
const sun = { ...light, ...block(".sun") };

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

const PASTELS = ["sky", "coral", "butter"] as const;
const SURFACES = ["bg", "surface", "surface-2", "field"] as const;

describe.each([
  ["dark", dark],
  ["light", light],
  ["sunlight", sun],
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
    // The tile is told apart from the bar by its deep eggplant fill and cream type.
    expect(ratio(t["tab-active-bg"], t.surface)).toBeGreaterThanOrEqual(1.5);
  });

  it("the kicker reads on every surface", () => {
    for (const k of SURFACES) expect(ratio(t.kicker, t[k])).toBeGreaterThanOrEqual(4.5);
  });

  it("body text stays AAA on tinted alerts and selected chips", () => {
    expect(ratio(t.fg, mix(t.butter, 0.14, t.surface))).toBeGreaterThanOrEqual(7);
    expect(ratio(t.fg, mix(t.sky, 0.12, t.surface))).toBeGreaterThanOrEqual(7);
  });
});

describe("sunlight theme (P1.5): a higher bar for outdoor glare", () => {
  it("body text is near-maximal (≥ 18:1) and secondary text ≥ 15:1 on every surface", () => {
    for (const s of SURFACES) {
      expect(ratio(sun.fg, sun[s])).toBeGreaterThanOrEqual(18);
      expect(ratio(sun.muted, sun[s])).toBeGreaterThanOrEqual(15);
      expect(ratio(sun.subtle, sun[s])).toBeGreaterThanOrEqual(12);
    }
  });
  it("edges are drawn, not hinted: borders ≥ 7:1 against the page and every surface", () => {
    for (const s of SURFACES) {
      expect(ratio(sun.border, sun[s])).toBeGreaterThanOrEqual(7);
      expect(ratio(sun["border-strong"], sun[s])).toBeGreaterThanOrEqual(15);
    }
  });
  it("links, status text, buttons, the hero and the current tab are ≥ 7:1", () => {
    for (const c of ["link", "danger", "success", "warning", "focus"] as const) for (const s of SURFACES) expect(ratio(sun[c], sun[s])).toBeGreaterThanOrEqual(7);
    expect(ratio(sun["on-primary"], sun.primary)).toBeGreaterThanOrEqual(15);
    expect(ratio(sun["hero-fg"], sun.hero)).toBeGreaterThanOrEqual(18);
    expect(ratio(sun["hero-muted"], sun.hero)).toBeGreaterThanOrEqual(15);
    expect(ratio(sun["tab-active-fg"], sun["tab-active-bg"])).toBeGreaterThanOrEqual(15);
  });
  it("is light-based, opaque and shadowless", () => {
    const body = themeBody(css, ".sun");
    expect(body).toMatch(/color-scheme: light;/);
    expect(body).toMatch(/--shadow-depth: 0 0 0 0 transparent;/);
    expect(body).not.toMatch(/rgb\([^)]*\/|rgba\(|transparent\s*\)/); // no translucent colours
  });
  it("heavier strokes: 2px edges, heavier icons, bolder body text, solid disabled buttons", () => {
    expect(css).toMatch(/\.sun body \{\s*font-weight: 500;/);
    expect(css).toMatch(/\.sun :is\(\.card,[^)]*\) \{\s*border-width: 2px;/);
    expect(css).toMatch(/\.sun svg\.lucide \{\s*stroke-width: 2\.5;/);
    expect(css).toMatch(/\.sun :is\(\.btn,[^)]*\):disabled:not\(\[aria-busy="true"\]\) \{\s*opacity: 1;[^}]*outline: 2px dashed/);
    // Links are told apart from text by an underline in their own colour, not a lime one that vanishes on white.
    expect(css).toMatch(/\.sun \.link \{\s*text-decoration-color: currentColor;/);
    // The switch's off track differs from its on track.
    expect(css).toMatch(/\.sun \.toggle input:not\(:checked\) \{\s*background: var\(--surface-2\);/);
    expect(ratio(sun["border-strong"], sun["surface-2"])).toBeGreaterThanOrEqual(3);
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

describe("status chips (redesign §4.1.3)", () => {
  it("every status label is AA on its own fill, every mode", () => {
    for (const th of [light, dark, sun]) {
      const night = th === dark;
      expect(ratio(th["on-accent"], th.accent)).toBeGreaterThanOrEqual(4.5); // live
      expect(ratio(th["on-solid"], th.solid)).toBeGreaterThanOrEqual(4.5); // paid
      expect(ratio(th.fg, th.surface)).toBeGreaterThanOrEqual(4.5); // approved
      expect(ratio(th.fg, mix(th.sky, night ? 0.16 : 0.45, th.surface))).toBeGreaterThanOrEqual(4.5); // sending
      expect(ratio(th.muted, th.surface)).toBeGreaterThanOrEqual(4.5); // pending, not shared
      expect(ratio(th.muted, th["surface-2"])).toBeGreaterThanOrEqual(4.5); // queued
      expect(ratio(th.warning, mix(th.butter, night ? 0.12 : 0.3, th.surface))).toBeGreaterThanOrEqual(4.5); // memory-only, overdue, disputed
      expect(ratio(th.danger, mix(th.coral, night ? 0.08 : 0.22, th.surface))).toBeGreaterThanOrEqual(4.5); // held, blocked
      expect(ratio(th.subtle, th["surface-2"])).toBeGreaterThanOrEqual(4.5); // closed
      expect(ratio(th.subtle, th.surface)).toBeGreaterThanOrEqual(4.5); // draft
      // The approved ring (no fill) is a non-text edge: 3:1 on the surface.
      expect(ratio(th.success, th.surface)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("mockup surfaces", () => {
  it("forest-ink fills (live chip, primary, send, swipe-to-save): cream type AAA, secondary text AAA", () => {
    for (const th of [light, dark, sun]) {
      expect(ratio(th["on-accent"], th.accent)).toBeGreaterThanOrEqual(7);
      expect(ratio(mix(th["on-accent"], 0.88, th.accent), th.accent)).toBeGreaterThanOrEqual(7);
    }
    // The live shift card keeps the hero canvas (the chip says "live"): eggplant by day, cream by night.
    expect(css).toMatch(/\.hero-card-accent \{[^}]*?background: var\(--hero\);/);
    expect(css).toMatch(/\.badge-live \{[^}]*?color: var\(--on-accent\);/);
  });
  it("by night a green fill has a light edge (forest ink alone is under 3:1 on the night surfaces)", () => {
    for (const s of SURFACES) expect(ratio(dark["accent-edge"], dark[s])).toBeGreaterThanOrEqual(3);
    expect(css).toMatch(/\.dark \.btn-primary \{\s*box-shadow: inset 0 0 0 1px var\(--accent-edge\);/);
    expect(css).toMatch(/\.badge-live \{[^}]*?border-color: var\(--accent-edge\);/);
  });
  it("chat shift banner text is AAA, its second line AA", () => {
    const lightBanner = mix(light.sky, 0.45, light.surface);
    const dk = mix(dark.sky, 0.14, dark.surface);
    expect(ratio(light.fg, lightBanner)).toBeGreaterThanOrEqual(7);
    expect(ratio(dark.fg, dk)).toBeGreaterThanOrEqual(7);
    expect(ratio(light.muted, lightBanner)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark.muted, dk)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("priority rings", () => {
  // The rings circle the next-shift card: eggplant, or forest ink while the shift is live.
  it("the outermost ring stands out from the page (WCAG non-text, ≥ 3:1)", () => {
    for (const th of [light, dark, sun]) {
      for (const s of ["bg", "surface", "surface-2"] as const) expect(ratio(th["ring-3"], th[s])).toBeGreaterThanOrEqual(3);
    }
  });
  it("by day a page-coloured gap separates the rings from any hero card", () => {
    expect(css).toMatch(/:root:not\(\.dark\) \.hero-card:is\(\[data-priority="1"\][^{]*\{\s*border-color: var\(--bg\);/);
    expect(ratio(light.ring, light.bg)).toBeGreaterThanOrEqual(3);
  });
  it("by night a page-coloured gap separates the rings from the card", () => {
    // The pale inner ring would sit close to the card, so the card's border takes the page colour.
    expect(css).toMatch(/\.dark \.hero-card:is\(\[data-priority="1"\], \[data-priority="2"\], \[data-priority="3"\]\) \{\s*border-color: var\(--bg\);/);
    expect(ratio(dark.ring, dark.bg)).toBeGreaterThanOrEqual(3);
    for (const k of ["ring", "ring-2", "ring-3"] as const) expect(lum(rgb(dark[k]))).toBeGreaterThan(lum(rgb(dark.surface)));
  });
  it("a single ring (priority 1) stands out from the page (≥ 3:1)", () => {
    for (const th of [light, dark, sun]) {
      for (const s of ["bg", "surface", "surface-2"] as const) expect(ratio(th.ring, th[s])).toBeGreaterThanOrEqual(3);
    }
  });
  it("each ring is darker than the one inside it", () => {
    for (const th of [light, dark, sun]) {
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
    const fromFonts = new Set(["font-barlow", "font-barlow-condensed", "font-dm-mono", "font-fraunces"]);
    const dangling = [...new Set([...css.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]))].filter((n) => !defined.has(n) && !fromFonts.has(n));
    expect(dangling).toEqual([]);
  });
});

describe("solid badges", () => {
  it("text on the solid fill (the eggplant tile) is AAA in every theme", () => {
    for (const th of [light, dark, sun]) expect(ratio(th["on-solid"], th.solid)).toBeGreaterThanOrEqual(7);
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
    for (const th of [light, dark, sun]) for (const p of PARTIES) expect(ratio(th.ink, th[`party-${p}`])).toBeGreaterThanOrEqual(7);
  });
  // By day the pastel chips sit close to the white card, like the other pastel
  // badges; that's not checked, since the party's name in the chip carries the
  // meaning (text contrast is checked above).
  it("by night each chip stands out from the eggplant card it sits on (≥ 3:1)", () => {
    for (const p of PARTIES) for (const s of SURFACES) expect(ratio(dark[`party-${p}`], dark[s])).toBeGreaterThanOrEqual(3);
  });
});

describe("the Turfcut palette: deep eggplant, warm paper, forest ink (G1)", () => {
  it("dark mode keeps the eggplant surfaces, raised eggplant tiles and forest-ink accent", () => {
    expect(dark.bg).toBe("#120d18");
    expect(dark.surface).toBe("#23182f");
    expect(dark["surface-2"]).toBe("#30223f");
    expect(dark.accent).toBe("#164b38");
    expect(dark.solid).toBe("#4a3365"); // settled status by night: the raised eggplant tile
    expect(dark["tab-active-bg"]).toBe("#4a3365");
    expect(dark.focus).toBe("#82bc9b");
  });
  it("light mode uses warm paper, deep eggplant identity and the forest-ink accent (founder, 2026-10-27)", () => {
    expect(light.bg).toBe("#efeae1");
    expect(light.fg).toBe("#1b1422");
    expect(light.accent).toBe("#164b38");
    expect(light.solid).toBe("#3a2154"); // settled status: the eggplant tile
    expect(light.hero).toBe("#281539");
    expect(light["tab-active-bg"]).toBe("#281539");
    expect(light.primary).toBe("#164b38");
    expect(light["on-primary"]).toBe("#fbf7f0");
    expect(light["tab-active-fg"]).toBe("#fbf7f0"); // cream on the eggplant tile, never green type
  });
  it("progress fills (the success colour) show against surfaces in both themes (≥ 3:1)", () => {
    for (const th of [light, dark, sun]) for (const k of ["surface", "surface-2"] as const) expect(ratio(th.success, th[k])).toBeGreaterThanOrEqual(3);
  });
  it("by night team avatars (raised eggplant tile) differ from people's avatars", () => {
    expect(css).toMatch(/\.dark \.avatar-team \{\s*background: var\(--solid\);/);
    expect(dark.solid).not.toBe(dark["surface-2"]);
  });
  it("warning text differs from error text by brightness, not only hue", () => {
    expect(ratio(light.warning, light.danger)).toBeGreaterThanOrEqual(1.5);
    expect(ratio(sun.warning, sun.danger)).toBeGreaterThanOrEqual(1.5);
  });
  it("every token in the theme blocks was parsed (so the contrast checks see them all)", () => {
    for (const sel of [":root", ".dark", ".sun"]) {
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


describe("forest ink is for what is live and the one primary action (G1)", () => {
  // Status that has settled (approved, paid, active, you) is the eggplant tile, never green.
  it("settled status, the date chip and selected filters are not the accent", () => {
    for (const th of [light, dark, sun]) expect(th.solid).not.toBe(th.accent);
    expect(css).toMatch(/\.badge-accent,\s*\.tag-accent \{ --badge-bg: var\(--sky\); \}/);
  });
  it("only an allowed list of rules paints with the accent", () => {
    // Every rule whose declarations use the accent: the live chip and the live shift card (and
    // its eyebrow tint), the cut, the send button and swipe-to-save (the action being taken), text
    // selection. Selectors are compared one by one, exactly, so a new green surface fails here
    // until it is argued for.
    const allowed = new Set([
      "@theme inline",
      "::selection",
      ".badge-live",
      ".status-live",
      ".swipe-under-save",
      ".send-btn",
    ]);
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...bare.matchAll(/([^{};]+)\{([^{}]*)\}/g)]
      .filter((m) => /var\(--(color-)?accent\)|#d6f25a|@apply[^;]*\b(bg|text|border|fill|stroke|ring|outline|decoration)-accent\b/i.test(m[2]))
      .flatMap((m) => m[1].split(",").map((x) => x.trim().replace(/\s+/g, " ")));
    // The theme blocks define the tokens.
    const themes = new Set([":root", ".dark", ".sun"]);
    expect(selectors.filter((sel) => !allowed.has(sel) && !themes.has(sel))).toEqual([]);
  });
  it("lime is retired: no token or rule holds it", () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/#d6f25a/i);
  });
  it("only the primary action and the accent tokens hold forest ink", () => {
    const mayBeGreen = new Set(["accent", "primary", "accent-edge", "cut"]);
    for (const sel of [":root", ".dark", ".sun"]) {
      const green = Object.entries(block(sel)).filter(([, v]) => v.toLowerCase() === "#164b38").map(([k]) => k);
      expect(green.filter((k) => !mayBeGreen.has(k))).toEqual([]);
    }
  });
  it("by night a chosen tile has a light edge as well as its fill (the fill alone is under 3:1)", () => {
    expect(css).toMatch(/\.dark :is\(\.tab\[aria-current\][^{]*\{\s*box-shadow: inset 0 0 0 1px var\(--muted\);/);
    expect(ratio(dark.muted, dark.surface)).toBeGreaterThanOrEqual(3);
  });
  it("the custom switch is the switch colour, not the primary action's green", () => {
    expect(css).toMatch(/\.toggle input:checked \{\s*background: var\(--switch-on\);/);
    for (const th of [light, dark, sun]) expect(ratio(th["on-primary"], th["switch-on"])).toBeGreaterThanOrEqual(3);
  });
  it("by night selected text stays readable (soft green with ink)", () => {
    expect(css).toMatch(/\.dark ::selection \{\s*background: var\(--cut\);\s*color: var\(--ink\);/);
    expect(ratio(dark.ink, dark.cut)).toBeGreaterThanOrEqual(7);
  });
  it("forest ink is never text on the night surfaces", () => {
    // 1.9:1 on #120D18: green type by night would be unreadable, so the dark text tokens aren't green.
    for (const k of ["fg", "muted", "subtle", "link", "kicker", "on-primary", "tab-active-fg"] as const) expect(dark[k]).not.toBe("#164b38");
  });
  it("no component paints with the accent or lime directly (classes, arbitrary values or the hex)", () => {
    const root = join(__dirname, "..");
    const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter(
      (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.replaceAll("\\", "/").startsWith("app/zz-preview")
    );
    // Moments maps a badge class to its fill for the paid-badge morph; .badge-live's is the accent.
    const ok = new Set(["components/Moments.tsx"]);
    const hits = files.filter((f) => !ok.has(f.replaceAll("\\", "/"))).filter((f) =>
      /\b(bg|text|border|fill|stroke|ring|outline|decoration|from|via|to|shadow|caret|accent|divide)-accent\b|var\(--(color-)?accent\)|#d6f25a|#ccea96|#164b38/i.test(readFileSync(join(root, f), "utf8"))
    );
    expect(hits).toEqual([]);
    // The offline page (public/sw.js) is plain HTML outside the stylesheet: no retired lime there either.
    expect(readFileSync(join(__dirname, "../../public/sw.js"), "utf8")).not.toMatch(/#ccea96|#d6f25a/i);
  });

  it("by night the checked radio dot reads on the card (≥ 3:1)", () => {
    expect(css).toMatch(/\.dark \.option-card input\[type="radio"\]:checked \{\s*background: var\(--fg\);/);
    expect(ratio(dark.fg, dark.surface)).toBeGreaterThanOrEqual(3);
  });
  it("success (done, verified) is not the live accent in any theme", () => {
    for (const th of [light, dark, sun]) expect(th.success).not.toBe(th.accent);
  });
  it("the organization rail is a deep eggplant panel: cream and lavender type AAA, the current tile AAA (every theme)", () => {
    for (const th of [light, dark, sun]) {
      expect(ratio(th["shell-fg"], th["shell-bg"])).toBeGreaterThanOrEqual(7);
      expect(ratio(th["shell-muted"], th["shell-bg"])).toBeGreaterThanOrEqual(7);
      expect(ratio(th["on-shell-active"], th["shell-active"])).toBeGreaterThanOrEqual(7);
    }
  });
  it("by night the primary object is a cream card that stands out from the eggplant shell (v4 hybrid)", () => {
    expect(ratio(dark.hero, dark.bg)).toBeGreaterThanOrEqual(7);
    expect(ratio(dark.hero, dark.surface)).toBeGreaterThanOrEqual(7);
    // Your own chat bubbles stay eggplant by night, with the ring in their own ink.
    expect(css).toMatch(/\.bubble-mine \{[^}]*?background: var\(--bubble-mine\);/);
    for (const th of [light, dark, sun]) expect(ratio(th["on-bubble-mine"], th["bubble-mine"])).toBeGreaterThanOrEqual(7);
    expect(dark["bubble-mine"]).not.toBe(dark.hero);
    expect(css).toMatch(/\.bubble-mine \* \{\s*--focus: currentColor;/);
    expect(ratio(dark["on-solid"], dark.solid)).toBeGreaterThanOrEqual(7);
  });
  it("the current Jobs view stands out from the switch's track (≥ 1.5:1, like the dock)", () => {
    expect(css).toMatch(/\.segmented \{[^}]*?background: var\(--surface\);/);
    for (const th of [light, dark]) expect(ratio(th["tab-active-bg"], th.surface)).toBeGreaterThanOrEqual(1.5);
  });
  it("the frame (shell) and its current tile, every mode (§2.0a)", () => {
    for (const th of [light, dark, sun]) {
      // The lavender current tile stands out from the frame, and its ink label reads.
      expect(ratio(th["shell-active"], th["shell-bg"])).toBeGreaterThanOrEqual(7);
      expect(ratio(th["on-shell-active"], th["shell-active"])).toBeGreaterThanOrEqual(7);
    }
    expect(light["shell-active"]).toBe("#d8cce4");
    expect(dark["shell-bg"]).toBe("#1a0f26");
    expect(sun["shell-bg"]).toBe("#000000");
    // By night the dock's current tile has a lavender edge: visible against the tile and the bar.
    expect(ratio(dark.muted, dark["tab-active-bg"])).toBeGreaterThanOrEqual(3);
    expect(ratio(dark.muted, dark.surface)).toBeGreaterThanOrEqual(3);
    expect(css).toMatch(/\.tab\[aria-current\]::before \{/);
    expect(css).toMatch(/\.dark \.status-sending \{\s*background: color-mix\(in srgb, var\(--sky\) 16%/);
    expect(css).toMatch(/:is\(\.btn-primary, \.tab\[aria-current\][^{]*:focus-visible \{\s*outline-offset: 3px;/);
  });
  it("the keyboard ring stays visible inside the eggplant rail and hero cards (every theme)", () => {
    expect(css).toMatch(/\.org-rail \* \{\s*--focus: var\(--shell-fg\);/);
    expect(css).toMatch(/\.hero-card:not\(\.hero-card-quiet\) \* \{\s*--focus: var\(--hero-fg\);/);
    for (const th of [light, dark, sun]) {
      expect(ratio(th["shell-fg"], th["shell-bg"])).toBeGreaterThanOrEqual(3);
      expect(ratio(th["hero-fg"], th.hero)).toBeGreaterThanOrEqual(3);
    }
  });
  it("the rail and the desktop top nav mark the current page with an eggplant tile, not a side stripe", () => {
    expect(css).toMatch(/\.org-rail \.rail-link\[aria-current\] \{[^}]*?background: var\(--shell-active\);/);
    expect(css).toMatch(/\.topnav-link\[aria-current\] \{[^}]*?background: var\(--tab-active-bg\);/);
    expect(css).not.toMatch(/inset 3px 0 0/);
  });
});

describe("the shell (redesign B1.4)", () => {
  it("the dock steps aside only for fields that take typing (never a select, a read-only field or a button)", () => {
    const rule = css.match(/body:has\(:is\(input:not\(([^)]*)\)[^{]*\.tabbar \{\s*display: none;/);
    expect(rule).not.toBeNull();
    for (const t of ["checkbox", "radio", "range", "button", "submit", "reset", "image", "color", "file"]) expect(rule![1]).toContain(`[type="${t}"]`);
    expect(rule![1]).toContain("[readonly]");
    expect(rule![0]).toContain("textarea:not([readonly])");
    expect(rule![0]).not.toMatch(/,\s*select\b/);
  });
  it("the phone's More sheet is a page-coloured panel: its rows use the page's tokens, never the frame's (every theme)", () => {
    expect(css).toMatch(/\.rail-link \{[^}]*?color: var\(--muted\);/);
    expect(css).toMatch(/\.rail-link\[aria-current\] \{[^}]*?background: var\(--tab-active-bg\);\s*color: var\(--tab-active-fg\);/);
    expect(css).toMatch(/\.org-rail \.rail-link \{\s*color: var\(--shell-muted\);/);
    for (const th of [light, dark, sun]) {
      expect(ratio(th.muted, th.surface)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(th["tab-active-fg"], th["tab-active-bg"])).toBeGreaterThanOrEqual(7);
      // The current row is told apart from the panel (by night with a lavender edge as well).
      expect(ratio(th["tab-active-bg"], th.surface)).toBeGreaterThanOrEqual(th === dark ? 1.5 : 3);
    }
    expect(css).toMatch(/\.dark :is\(\.tab\[aria-current\], \.more-sheet \.rail-link\[aria-current\]/);
  });

  it("has a skip link that appears on keyboard focus, landing on a wrapper without a ring", () => {
    expect(css).toMatch(/\.skip-link \{[^}]*translate: 0 -200%;/);
    expect(css).toMatch(/\.skip-link:focus-visible \{\s*translate: 0 0;/);
    expect(css).toMatch(/\.skip-target:focus \{\s*outline: none;/);
  });

  it("runs the organization rail full height under a header of fixed height", () => {
    expect(css).toMatch(/--site-header-h: 65px;/);
    // Pinned in px, so text size never moves the rail out from under it; a thread's own bar sits below it.
    expect(css).toMatch(/\.site-header-bar \{\s*height: calc\(var\(--site-header-h\) - 1px\);/);
    expect(css).toMatch(/body:has\(\.org-rail\) \.thread-top \{\s*top: var\(--site-header-h\);/);
    expect(css).toMatch(/\.org-rail \{\s*top: var\(--site-header-h\);\s*height: calc\(100dvh - var\(--site-header-h\)\);/);
    expect(css).toMatch(/\.org-shell \{\s*@apply mx-auto flex w-full max-w-\[var\(--workspace-max\)\] flex-1;/);
  });

  it("gives the staff console its own band and never an organization's rail beside it", () => {
    expect(css).toMatch(/\.staff-band \{[^}]*background: var\(--shell-bg\);[^}]*color: var\(--shell-fg\);/);
    expect(css).toMatch(/\.staff-band \* \{\s*--focus: var\(--shell-fg\);/);
    expect(css).toMatch(/body:has\(\.staff-band\) \.org-rail:not\(\.staff-rail\) \{\s*display: none;/);
  });
});
