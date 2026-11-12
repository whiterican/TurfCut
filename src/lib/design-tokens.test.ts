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
] as const)("%s theme contrast", (name, t) => {
  it("body text is AAA (≥ 7:1) on every surface", () => {
    for (const s of SURFACES) expect(ratio(t.fg, t[s])).toBeGreaterThanOrEqual(7);
  });

  it("secondary text is AA on every surface; Subtle (#64748B, locked) is AA on the page and white, and never sits on the Muted fill", () => {
    // #111: the locked Subtle is 4.76:1 on white and 4.51:1 on Cream (AA), 3.84:1 on Muted, so --muted
    // (one step darker, derived) is the role for type that may sit on a Muted fill (chips, segmented tracks).
    for (const s of SURFACES) expect(ratio(t.muted, t[s])).toBeGreaterThanOrEqual(4.5);
    for (const s of ["bg", "surface", "field"] as const) expect(ratio(t.subtle, t[s])).toBeGreaterThanOrEqual(4.5);
    expect(css).not.toMatch(/\.status-closed \{[^}]*color: var\(--subtle\)/);
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

  it("primary buttons are AA (white on the locked Forest #157A46 is 5.38:1, kept as printed, #111)", () => {
    expect(ratio(t["on-primary"], t.primary)).toBeGreaterThanOrEqual(4.5);
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

  it("the shape scale is the rounder one, buttons are pills, and nothing uses Tailwind's named radius utilities (they read the same tokens)", () => {
    expect(css).toMatch(/--radius-xs: 10px;\s*--radius-sm: 14px;\s*--radius-md: 24px;\s*--radius-lg: 28px;\s*--radius-xl: 32px;/);
    expect(css).toMatch(/--radius-button: 9999px;/);
    expect(css).toMatch(/\.btn-ghost \{\s*@apply [^;]*rounded-\[var\(--radius-button\)\]/);
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "zz-preview" ? [] : walk(join(dir, e.name))) : /\.(tsx|css)$/.test(e.name) ? [join(dir, e.name)] : []));
    const named = walk(join(__dirname, "..")).filter((f) => /(?<![\w-])rounded(-[a-z]{1,2})?-(xs|sm|md|lg|xl|2xl|3xl)(?![\w-])/.test(readFileSync(f, "utf8")));
    expect(named).toEqual([]);
  });

  it("the dock is Liquid Glass: ink icons on a translucent pane, the current one in a tinted capsule; Sunlight keeps its solid black frame", () => {
    expect(css).toMatch(/\.tabbar \{[^}]*?background: var\(--dock-sheen\), var\(--dock-bg\);[^}]*?backdrop-filter: var\(--dock-filter\);[^}]*?box-shadow: var\(--dock-highlight\);/);
    expect(css).toMatch(/\.tab \{[^}]*?color: var\(--dock-fg\);[^}]*\}/);
    expect(css).toMatch(/\n  \.tab\[aria-current\] \{[^}]*?color: var\(--dock-current-fg\);\s*background: var\(--dock-current-bg\);/);
    // The tab you're on is solid, not a tint (Caden, Nov 11: the tint read as washed out): the selection colour nearly opaque, white on it by day and ink by night.
    expect(css).toMatch(/--dock-current-bg: color-mix\(in srgb, var\(--select\) 92%, transparent\);\s*--dock-current-fg: #ffffff;\s*--dock-capsule: color-mix\(in srgb, var\(--select\) 26%, transparent\);/);
    expect(themeBody(css, ".dark")).toMatch(/--dock-current-fg: var\(--ink\);/);
    expect(css).toMatch(/\.tab\[aria-current\] \.tab-icon \{[^}]*?filter: none;/);
    // The dock is the clearest glass in the app (Caden's reference, Nov 10): a faint tint and a light blur, so the page shows through.
    expect(css).toMatch(/\nhtml \{[^}]*?--dock-bg: color-mix\(in srgb, var\(--surface\) 12%, transparent\);\s*--dock-filter: blur\(3\.5px\) saturate\(170%\);/);
    expect(themeBody(css, ".dark")).toMatch(/--dock-bg: color-mix\(in srgb, var\(--surface\) 16%, transparent\);\s*--dock-filter: blur\(3\.5px\) saturate\(130%\);/);
    // So little pane cannot carry contrast by itself: every dock icon is outlined in the page's own colour instead.
    expect(css).toMatch(/\n  \.tab-icon \{[^}]*?filter: (drop-shadow\(0 0 0\.5px var\(--dock-halo\)\) ){3}drop-shadow\(0 0 1px var\(--dock-halo\)\) drop-shadow\(0 0 3px var\(--dock-halo\)\);/);
    expect(css).toMatch(/\nhtml \{[^}]*?--dock-halo: var\(--surface\);/);
    expect(themeBody(css, ".dark")).toMatch(/--dock-halo: var\(--bg\);/);
    // The pane's share of the card colour, by day and by night; the rest is whatever scrolls behind it.
    expect(css).toMatch(/\nhtml \{[^}]*?--glass-bg: color-mix\(in srgb, var\(--surface\) 45%, transparent\);/);
    expect(themeBody(css, ".dark")).toMatch(/--glass-bg: color-mix\(in srgb, var\(--surface\) 62%, transparent\);/);
    if (name === "sunlight") {
      // Solid: the black frame, white icons, a white current tile with black type.
      expect(themeBody(css, ".sun")).toMatch(/--glass-bg: var\(--surface\);[\s\S]*--glass-filter: none;[\s\S]*--dock-bg: var\(--shell-bg\);\s*--dock-fg: var\(--shell-muted\);/);
      expect(css).toMatch(/\.sun \.tab\[aria-current\] \{\s*background: var\(--shell-active\);\s*color: var\(--on-shell-active\);/);
      expect(ratio(t["shell-muted"], t["shell-bg"])).toBeGreaterThanOrEqual(7);
      expect(ratio(t["on-shell-active"], t["shell-active"])).toBeGreaterThanOrEqual(7);
    } else {
      // Worst case behind the pane: black under the day's glass, white under the night's. The icons still read, on the pane and on the capsule.
      const pane = name === "dark" ? mix(t.surface, 0.62, "#ffffff") : mix(t.surface, 0.45, "#000000");
      const hex = (c: RGB) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
      // These panes hold icons only (icon buttons): 3:1, the bar for graphics (WCAG 1.4.11). Panes with text are denser, below.
      expect(ratio(t.fg, pane)).toBeGreaterThanOrEqual(3);
      // The selection is tinted purple by day and green by night; the icon on it keeps the ink.
      expect(ratio(t.fg, mix(t.select, 0.26, hex(pane)))).toBeGreaterThanOrEqual(3);
      // The current tab's icon on its solid capsule, over the worst case showing through the capsule's last 8%: 4.5:1 or better.
      const capsuleOver = (behind: string) => mix(t.select, 0.92, behind);
      const currentFg = name === "dark" ? t.ink : "#ffffff";
      for (const behind of ["#000000", "#ffffff"]) expect(ratio(currentFg, capsuleOver(behind))).toBeGreaterThanOrEqual(4.5);
      // The dock's pane is nearly clear, so its icons are judged against their own halo, which is what sits next to every stroke.
      // The halo is soft, not a solid fill: it is taken at half strength over the worst case behind the dock's own pane (black by day, white by night). An estimate of the blur, not a measurement.
      const dockPane = name === "dark" ? mix(t.surface, 0.16, "#ffffff") : mix(t.surface, 0.12, "#000000");
      expect(ratio(t.fg, mix(name === "dark" ? t.bg : t.surface, 0.5, hex(dockPane)))).toBeGreaterThanOrEqual(3);
      // The named menu button and the drawer carry text: body ink holds AA on the stronger pane over the same worst case.
      expect(css).toMatch(/\.menu-button\[data-named\] \{[^}]*?background: var\(--glass-sheen\), var\(--glass-bg-strong\);/);
      expect(css).toMatch(/\nhtml \{[^}]*?--glass-bg-strong: color-mix\(in srgb, var\(--surface\) 79%, transparent\);/);
      expect(themeBody(css, ".dark")).toMatch(/--glass-bg-strong: color-mix\(in srgb, var\(--surface\) 78%, transparent\);/);
      const strong = name === "dark" ? mix(t.surface, 0.78, "#ffffff") : mix(t.surface, 0.79, "#000000");
      expect(ratio(t.fg, strong)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.muted, strong)).toBeGreaterThanOrEqual(4.5);
      // The selected row's label, on its tint over that pane (the drawer) and over the bar's pane on the page (the sidebar).
      expect(ratio(t.fg, mix(t.select, 0.26, hex(strong)))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.fg, mix(t.select, 0.26, hex(mix(t.surface, 0.8, t.bg))))).toBeGreaterThanOrEqual(7);
      // By night the glint is white over light type, so it is kept faint: at its brightest (8%) icons on the glass still hold 3:1 over white.
      expect(themeBody(css, ".dark")).toMatch(/--glass-sheen: linear-gradient\(135deg, rgb\(255 255 255 \/ 0\.08\) 0%/);
      if (name === "dark") expect(ratio(t.fg, mix("#ffffff", 0.08, hex(pane)))).toBeGreaterThanOrEqual(3);
      // On the drawer and sheets the faintest grey steps up to muted, as in the bars.
      expect(css).toMatch(/:is\(\.thread-top, \.composer, \.more-sheet-panel, \.sheet-panel\) \{\s*--subtle: var\(--muted\);/);
    }
    // Cards are heavy glass (Caden, Nov 12). Unlike the controls they never float over content: behind a card is only the
    // page's purple gradient. Its strongest colour is its top (--page-top), and it is fixed to the screen, so any card
    // and any bare line of text can pass over that colour. Everything is held to it.
    if (name !== "sunlight") {
      const dark = name === "dark";
      expect(dark ? themeBody(css, ".dark") : css).toMatch(dark ? /--card-bg: color-mix\(in srgb, var\(--surface\) 40%, transparent\);\s*--card-filter: none;/ : /--card-bg: color-mix\(in srgb, var\(--surface\) 38%, transparent\);\s*--card-filter: none;/);
      // No blur on a card: behind it is only a smooth gradient, where a blur shows nothing and costs a layer per card.
      const h = (c: RGB) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
      // The gradient: opaque, from --page-top easing toward the page colour, one recipe for day and night. Pinned, so the
      // sheet cannot drift from what is checked: no stop is stronger than the first.
      expect(css).toMatch(/--page-wash: linear-gradient\(\s*180deg,\s*var\(--page-top\) 0%,\s*color-mix\(in srgb, var\(--page-top\) 58%, var\(--bg\)\) 30%,\s*color-mix\(in srgb, var\(--page-top\) 22%, var\(--bg\)\) 64%,\s*color-mix\(in srgb, var\(--page-top\) 8%, var\(--bg\)\) 100%\s*\);/);
      expect(themeBody(css, ".dark")).not.toMatch(/--page-wash:/);
      expect(t["page-top"]).toBe(dark ? "#3c1f66" : "#d6c9ea");
      const page = rgb(t["page-top"]);
      const card = mix(t.surface, dark ? 0.4 : 0.38, h(page));
      // On the pane and on the bare page at its strongest: body text AAA, and every other text colour AA. Form errors,
      // "done" marks and warnings sit on both, so the status colours are held to both.
      for (const ground of [card, page]) {
        expect(ratio(t.fg, ground)).toBeGreaterThanOrEqual(7);
        for (const k of ["muted", "subtle-on-glass", "kicker", "link", "danger", "success", "warning"] as const) expect(ratio(t[k], ground)).toBeGreaterThanOrEqual(4.5);
      }
      // The faintest grey steps darker by day (Subtle itself is locked, and is under AA on the purple).
      expect(t["subtle-on-glass"]).toBe(dark ? t.subtle : "#4a576b");
      expect(css).toMatch(/\nbody \{[^}]*?--subtle: var\(--subtle-on-glass\);/);
      // The glint across a card is white. By day that only adds contrast. By night it takes contrast from light type, so
      // the pane is checked again under the glint at its brightest (its first stop), where a card's first line can sit.
      if (dark) {
        const glint = themeBody(css, ".dark").match(/--card-sheen: linear-gradient\(135deg, rgb\(255 255 255 \/ ([\d.]+)\) 0%, rgb\(255 255 255 \/ ([\d.]+)\) 30%, rgb\(255 255 255 \/ 0\) 56%, rgb\(255 255 255 \/ ([\d.]+)\) 100%\);/);
        expect(glint).not.toBeNull();
        const brightest = Math.max(...glint!.slice(1).map(Number));
        expect(brightest).toBe(0.1);
        const lit = mix("#ffffff", brightest, h(card));
        for (const k of ["fg", "muted", "subtle-on-glass", "kicker", "link", "danger", "success", "warning"] as const) expect(ratio(t[k], lit)).toBeGreaterThanOrEqual(4.5);
      }
      // The menu that hangs over a thread is opaque: two classes, so the glass rule cannot thin it.
      expect(css).toMatch(/\.card\.card-solid \{\s*background: var\(--card-sheen\), var\(--surface\);\s*-webkit-backdrop-filter: none;\s*backdrop-filter: none;/);
      expect(css).toMatch(/\{\s*background: var\(--card-sheen\), var\(--card-bg\);\s*-webkit-backdrop-filter: var\(--card-filter\);\s*backdrop-filter: var\(--card-filter\);\s*--subtle: var\(--subtle-on-glass\);/);
    }
    // The gradient is painted by one layer fixed to the screen, under everything: the body has no background of its own
    // (it would cover the layer), the root carries the top colour (overscroll, and an installed app's status bar strip),
    // and the layer's own colour is the top colour too. Where there is no gradient, the top colour is the page colour.
    expect(css).toMatch(/\nhtml \{[^}]*?\n  background: var\(--page-top\);/);
    expect(css).toMatch(/\nbody::before \{\s*content: "";\s*position: fixed;\s*inset: 0;\s*min-height: 100lvh;\s*z-index: -1;\s*pointer-events: none;\s*background: var\(--page-wash\) no-repeat, var\(--page-top\);\s*\}/);
    expect(css.slice(css.indexOf("\nbody {"), css.indexOf("}", css.indexOf("\nbody {")))).not.toMatch(/background/);
    expect(css).toMatch(/\nbody:has\(\.thread-top\) \{\s*--page-wash: none;\s*--page-top: var\(--bg\);\s*\}/);
    // A page with a header across the top takes the header's pane for the strip; a chat the plain page colour. Both as
    // weak as the root's own rule (:where), and before the drawer's rule, which must win while the drawer is open.
    expect(css).toMatch(/--header-root: color-mix\(in srgb, var\(--surface\) 80%, var\(--page-top\)\);/);
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(bare).toMatch(/@media screen \{\s*html:where\(:has\(\.site-header:not\(\.site-header-worker\)\)\) \{\s*background: var\(--header-root\);\s*\}\s*\}\s*@media screen and \(min-width: 48rem\) \{\s*html:where\(:has\(\.site-header\)\) \{\s*background: var\(--header-root\);\s*\}\s*\}\s*@media screen and \(max-width: 47\.99rem\) \{\s*html:where\(:has\(\.site-header:not\(\.site-header-worker\)\)\) \{\s*background: var\(--page-top\);\s*\}\s*\}\s*@media screen \{\s*html:where\(:has\(\.thread-top\)\) \{\s*background: var\(--bg\);\s*\}\s*\}/);
    expect(css.indexOf("html:where(:has(.thread-top))")).toBeLessThan(css.indexOf("html:has(.more-sheet[open]) {"));
    expect(css.indexOf("\nhtml {")).toBeLessThan(css.indexOf("html:where(:has(.site-header:not(.site-header-worker)))"));
    expect(css).toMatch(/body:has\(\.more-sheet\[open\]\) \{\s*--page-wash: none;\s*background-color: var\(--drawer-root\);[^}]*?--page-top: var\(--drawer-root\);/);
    // Under the status bar the page blurs away into the strip's own colour, and the pill sits above that band.
    const band = css.match(/\.phone-top::before \{([^}]*)\}/)?.[1] ?? "";
    expect(band).toMatch(/position: fixed;\s*inset: 0 0 auto;\s*height: calc\(3\.5rem \+ env\(safe-area-inset-top\)\);/);
    expect(band).toMatch(/background: linear-gradient\(to bottom, var\(--page-top\) 0%/);
    expect(band).toMatch(/backdrop-filter: blur\(12px\);/);
    expect(band).toMatch(/pointer-events: none;/);
    expect(band).toMatch(/z-index: 44;/);
    expect(band).toMatch(/mask-image: linear-gradient\(to bottom, #000 0%, #000 50%, transparent 100%\);/);
    expect(band).toMatch(/view-transition-name: phone-band;/);
    expect(css).toMatch(/::view-transition-group\(site-header\),\s*::view-transition-group\(tabbar\),\s*::view-transition-group\(phone-band\) \{\s*animation: none;\s*z-index: 100;/);
    // Shown everywhere but Sunlight and the solid fallback: hidden exactly twice.
    expect(css.match(/\.phone-top::before \{\s*display: none;/g)).toHaveLength(2);
    expect(css).toMatch(/\.phone-top \.menu-button \{\s*z-index: 45;/);
    // Sunlight and the solid fallback have no blur and no band.
    expect(css).toMatch(/\.sun \.phone-top::before \{\s*display: none;/);
    expect(css.slice(css.indexOf("@media (prefers-reduced-transparency: reduce)"))).toMatch(/\.phone-top::before \{\s*display: none;/);
    // A phone's top bar has no edge: the page's top colour fading to clear past the bar, blurring what scrolls under it.
    const phoneBar = css.slice(css.indexOf("@media (max-width: 47.99rem) {\n  body:not(:has(.thread-top)) .site-header {"));
    expect(phoneBar).toMatch(/^[\s\S]{0,400}?\n  \.site-header \{\s*background: none;\s*-webkit-backdrop-filter: none;\s*backdrop-filter: none;\s*\}/);
    const fade = phoneBar.match(/\n  \.site-header::before \{([^}]*)\}/)?.[1] ?? "";
    expect(fade).toMatch(/inset: 0 0 -1\.25rem;\s*z-index: -1;\s*pointer-events: none;/);
    expect(fade).toMatch(/background: linear-gradient\(to bottom, var\(--page-top\) 0%,[^;]*transparent 100%\);/);
    expect(fade).toMatch(/backdrop-filter: blur\(18px\);/);
    expect(fade).toMatch(/mask-image: linear-gradient\(to bottom, #000 0%, #000 62%, transparent 100%\);/);
    expect(phoneBar).toMatch(/\.sun \.site-header::before \{\s*inset: 0;\s*background: var\(--bg\);\s*-webkit-backdrop-filter: none;\s*backdrop-filter: none;/);
    expect(css.slice(css.indexOf("@media (prefers-reduced-transparency: reduce)"))).toMatch(/\.site-header::before \{\s*inset: 0;\s*background: var\(--bg\);/);
    // Paper has no layer.
    expect(css).toMatch(/@media print \{[\s\S]*?body::before \{ display: none; \}/);
    // Anyone who asks for less transparency or more contrast gets solid surfaces.
    expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\), \(forced-colors: active\) \{\s*html,\s*\.dark \{\s*--glass-bg: var\(--surface\);/);
    expect(css).toMatch(/\.site-header \{[^}]*?background: var\(--header-bg\);/);
    // Bars with small secondary text are denser panes: muted text holds AA over the worst thing behind them.
    expect(css).toMatch(/--glass-bg-bar: color-mix\(in srgb, var\(--surface\) 80%, transparent\);\s*--header-bg: var\(--glass-bg-bar\);/);
    if (name !== "sunlight") expect(ratio(t.muted, mix(t.surface, 0.8, name === "dark" ? "#ffffff" : "#000000"))).toBeGreaterThanOrEqual(4.5);
    // Sunlight and the solid fallback name every pane, and the header goes back to the page colour.
    for (const body of [themeBody(css, ".sun"), css.slice(css.indexOf("@media (prefers-reduced-transparency: reduce)"), css.indexOf("\n}\n", css.indexOf("@media (prefers-reduced-transparency: reduce)")))]) {
      for (const k of ["glass-bg", "glass-bg-strong", "glass-bg-bar", "glass-filter", "glass-sheen", "card-bg", "card-sheen", "card-filter", "page-wash"]) expect(body).toMatch(new RegExp(`--${k}: (var\\(--surface\\)|none);`));
      expect(body).toMatch(/--header-bg: var\(--bg\);/);
      // ...and with no gradient, the top of the page and the header's strip are the page colour.
      expect(body).toMatch(/--page-top: var\(--bg\);\s*--header-root: var\(--bg\);/);
    }
    // The other text-bearing bars use the denser pane too, by night as well, and their faintest grey steps up to muted.
    for (const sel of ["\\.composer", "\\.thread-top"]) expect(css).toMatch(new RegExp(`\\n  ${sel} \\{[^}]*?background: var\\(--glass-bg-bar\\);`));
    expect(themeBody(css, ".dark")).toMatch(/--glass-bg-bar: color-mix\(in srgb, var\(--surface\) 80%, transparent\);/);
    expect(css).toMatch(/\.swipe-card \{[^}]*?background: var\(--card-sheen\), var\(--surface\);/);
    // A field keeps the page's hairline, not the glass edge.
    expect(css).toMatch(/\.field \{[^}]*?border-color: var\(--border\);/);
    // The dock's edge is drawn in ink, so it stands apart from the page without leaning on its shadow.
    expect(css).toMatch(/\.tabbar \{[^}]*?border: 1px solid var\(--dock-border\);/);
    expect(css).toMatch(/\.eyebrow \{[^}]*?color: var\(--kicker\);/);
    // Print drops the menu strip with the dock, and the admin console shows no menu.
    expect(css).toMatch(/\.site-header, \.tabbar, \.phone-top, \.no-print, nextjs-portal \{ display: none !important; \}/);
    expect(css).toMatch(/body:has\(\.staff-band\) :is\(\.phone-top, \.site-header \.menu-button\) \{\s*display: none;/);
    // No words in the dock: each tab's name is in the markup for screen readers, never drawn.
    expect(css).toMatch(/\.tab-label \{\s*@apply sr-only;/);
    expect(css).not.toMatch(/\.tab-label \{[^}]*not-sr-only/);
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
    expect(css).toMatch(/\.sun body \{\s*font-weight: 600;/);
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
      expect(ratio(th.muted, th["surface-2"])).toBeGreaterThanOrEqual(4.5); // closed (muted type on the Muted fill)
      expect(ratio(th.subtle, th.surface)).toBeGreaterThanOrEqual(4.5); // draft
      // The approved ring (no fill) is a non-text edge: 3:1 on the surface.
      expect(ratio(th.success, th.surface)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("mockup surfaces", () => {
  it("Forest fills (live chip, primary, send, swipe-to-save): white type AA (5.38:1 on the locked Forest), secondary text AA", () => {
    for (const th of [light, dark, sun]) {
      expect(ratio(th["on-accent"], th.accent)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(mix(th["on-accent"], 0.88, th.accent), th.accent)).toBeGreaterThanOrEqual(4.5);
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
  it("the primary action is the locked Forest with white type in light and dark; every type role is Inter (#111)", () => {
    expect(light.primary).toBe("#157a46");
    expect(dark.primary).toBe("#157a46");
    expect(light["on-primary"]).toBe("#ffffff");
    for (const u of ["t-display", "t-title", "t-headline", "t-section", "t-label", "t-figure"]) {
      expect(css).toMatch(new RegExp(`@utility ${u} \\{[^}]*?font-family: var\\(--font-inter\\)`));
    }
    // No second face anywhere in the sheet (comments aside; "sans-serif" is the system fallback).
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/(?<![-\w])serif|Georgia|Fraunces|Barlow|DM Mono/i);
    // The printed scale, one weight step heavier (Nov 10): H1 28/36 800, H2 20/28 700, H3 16/24 700, Caption 14/20, Small 12/16.
    // One step heavier throughout (Nov 10): body 500, and each named weight a step above its default.
    expect(css).toMatch(/--font-weight-normal: 500;\s*--font-weight-medium: 600;\s*--font-weight-semibold: 700;\s*--font-weight-bold: 800;/);
    expect(css).toMatch(/\nbody \{[^}]*?font-weight: 500;/);
    expect(readFileSync(join(__dirname, "../app/layout.tsx"), "utf8")).toMatch(/weight: \["500", "600", "700", "800"\]/);
    expect(css).toMatch(/@utility t-title \{[^}]*?font-size: 1\.75rem;\s*line-height: 2\.25rem;\s*font-weight: 800;/);
    expect(css).toMatch(/@utility t-headline \{[^}]*?font-size: 1\.25rem;\s*line-height: 1\.75rem;\s*font-weight: 700;/);
    expect(css).toMatch(/@utility t-section \{[^}]*?font-size: 1rem;\s*line-height: 1\.5rem;\s*font-weight: 700;/);
    expect(css).toMatch(/--text-xs: 0\.75rem;/);
    expect(css).toMatch(/--text-sm: 0\.875rem;/);
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
    const fromFonts = new Set(["font-inter"]);
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

describe("the ten locked colours (founder's twelve-screen concept, #111)", () => {
  const LOCKED = { eggplant: "#1c0f2e", forest: "#157a46", cream: "#faf9f4", surface: "#ffffff", muted: "#e7e6ed", border: "#d7d2e0", text: "#0f172a", subtle: "#64748b", warning: "#f59e0b", error: "#ef4444" } as const;
  it("are copied verbatim as base tokens", () => {
    for (const [k, v] of Object.entries(LOCKED)) expect(light[`base-${k}`]).toBe(v);
  });
  it("light mode takes its roles straight from them: Cream page, white cards, Muted fills, Border lines, Text and Subtle type, Forest actions, Eggplant frame", () => {
    expect(light.bg).toBe(LOCKED.cream);
    expect(light.surface).toBe(LOCKED.surface);
    expect(light.field).toBe(LOCKED.surface);
    expect(light["surface-2"]).toBe(LOCKED.muted);
    expect(light.border).toBe(LOCKED.border);
    expect(light.fg).toBe(LOCKED.text);
    expect(light.ink).toBe(LOCKED.text);
    expect(light.subtle).toBe(LOCKED.subtle);
    expect(light.primary).toBe(LOCKED.forest);
    expect(light.accent).toBe(LOCKED.forest);
    expect(light.focus).toBe(LOCKED.forest);
    expect(light["shell-bg"]).toBe(LOCKED.eggplant);
    expect(light.solid).toBe(LOCKED.eggplant);
    expect(light.hero).toBe(LOCKED.eggplant);
    expect(light["tab-active-bg"]).toBe(LOCKED.eggplant);
    expect(light["shell-muted"]).toBe(LOCKED.cream);
  });
  it("the old palette is gone: no #164b38 forest, no #2b1b3d eggplant, no beige page, no lime, no lavender tile", () => {
    const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
    // (Sunlight keeps its own cream paper #fbf7f0: that mode is an accessibility treatment, not the brand canvas.)
    for (const hex of ["#164b38", "#2b1b3d", "#efeae1", "#c6ec8c", "#f5f3ee", "#17101f"]) expect(plain.toLowerCase().includes(hex), hex).toBe(false);
    expect(css).not.toMatch(/--cut:/);
  });
  it("dark mode (a proposal: the concept shows light only) keeps the same Eggplant dock and Forest action over deeper eggplant surfaces", () => {
    expect(dark["shell-bg"]).toBe(LOCKED.eggplant);
    expect(dark.primary).toBe(LOCKED.forest);
    expect(dark.accent).toBe(LOCKED.forest);
    expect(dark.bg).toBe("#140a22");
    expect(dark.surface).toBe("#231538");
    expect(dark["surface-2"]).toBe("#2f2048");
    // By night the feature card is a raised eggplant card with white type, not a cream card.
    expect(lum(rgb(dark.hero))).toBeLessThan(lum(rgb(dark["hero-fg"])));
    expect(dark["dock-active-fg"]).toBe(light["dock-active-fg"]);
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
  it("the Warning and Error bases are fills: their tints carry ink type AAA and their text roles are darker derivations", () => {
    expect(ratio(light.ink, light["base-warning"])).toBeGreaterThanOrEqual(7);
    expect(ratio(light.ink, light["base-error"])).toBeGreaterThanOrEqual(4.5);
    for (const s of SURFACES) {
      expect(ratio(light.danger, light[s])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(light.warning, light[s])).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("every token in the theme blocks was parsed (so the contrast checks see them all)", () => {
    for (const sel of [":root", ".dark", ".sun"]) {
      const body = themeBody(css, sel);
      const parsed = block(sel);
      for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
        if (/^#[0-9a-fA-F]{6}$/.test(value.trim())) expect(parsed[name]).toBe(value.trim());
        else if (name === "hero-border") expect(value.trim()).toBe("transparent");
        else expect(name).toMatch(/^(shadow|shadow-depth|shadow-pressed|glass-(bg|bg-strong|bg-bar|border|highlight|filter|sheen)|card-(bg|edge|sheen|filter|glow)|dock-(bg|fg|border|ring|filter|sheen|highlight|halo|current-bg|current-fg)|drawer-root|header-bg|header-root|page-top|page-wash)$/); // the only non-colour tokens: shadows and the glass recipe
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
  it("only the action roles hold Forest: the primary action, the live accent, focus, the chosen option and the switch", () => {
    const mayBeGreen = new Set(["base-forest", "accent", "primary", "accent-edge", "focus", "selected", "switch-on"]);
    for (const sel of [":root", ".dark", ".sun"]) {
      const green = Object.entries(block(sel)).filter(([, v]) => v.toLowerCase() === "#157a46").map(([k]) => k);
      expect(green.filter((k) => !mayBeGreen.has(k))).toEqual([]);
    }
  });
  it("by night a chosen chip has a light edge as well as its fill (the fill alone is under 3:1; the dock's lavender tile needs none)", () => {
    expect(css).toMatch(/\.dark :is\(\.chip:has\(input:checked\)[^{]*\{\s*box-shadow: inset 0 0 0 1px var\(--muted\);/);
    expect(ratio(dark.muted, dark.surface)).toBeGreaterThanOrEqual(3);
  });
  it("the custom switch is the switch colour, not the primary action's green", () => {
    expect(css).toMatch(/\.toggle input:checked \{\s*background: var\(--switch-on\);/);
    for (const th of [light, dark, sun]) expect(ratio(th["on-primary"], th["switch-on"])).toBeGreaterThanOrEqual(3);
  });
  it("by night selected text stays readable (the dock green with ink type; Forest would hide it at 1.7:1)", () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).toMatch(/\.dark ::selection \{\s*background: var\(--dock-active-fg\);\s*color: var\(--ink\);/);
    expect(ratio(dark.ink, dark["dock-active-fg"])).toBeGreaterThanOrEqual(7);
  });
  it("Forest is never text on the night surfaces", () => {
    // 2.9:1 on the night card: Forest type by night would be unreadable, so the dark text tokens aren't Forest.
    for (const k of ["fg", "muted", "subtle", "link", "kicker", "on-primary", "tab-active-fg", "success"] as const) expect(dark[k]).not.toBe("#157a46");
  });
  it("no component paints with the accent or lime directly (classes, arbitrary values or the hex)", () => {
    const root = join(__dirname, "..");
    const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter(
      (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.replaceAll("\\", "/").startsWith("app/zz-preview")
    );
    // Moments maps a badge class to its fill for the paid-badge morph; .badge-live's is the accent.
    // The last-resort error page runs without the stylesheet, so it copies token values (checked below).
    const ok = new Set(["components/Moments.tsx", "app/global-error.tsx"]);
    const hits = files.filter((f) => !ok.has(f.replaceAll("\\", "/"))).filter((f) =>
      /\b(bg|text|border|fill|stroke|ring|outline|decoration|from|via|to|shadow|caret|accent|divide)-accent\b|var\(--(color-)?accent\)|#d6f25a|#ccea96|#164b38|#157a46|#1c0f2e/i.test(readFileSync(join(root, f), "utf8"))
    );
    expect(hits).toEqual([]);
    // The offline page (public/sw.js) is plain HTML outside the stylesheet: no retired lime there either.
    expect(readFileSync(join(__dirname, "../../public/sw.js"), "utf8")).not.toMatch(/#ccea96|#d6f25a/i);
  });

  it("the last-resort error page only copies colours the tokens define", () => {
    const page = readFileSync(join(__dirname, "../app/global-error.tsx"), "utf8");
    const used = [...new Set(page.match(/#[0-9a-f]{6}\b/gi) ?? [])];
    expect(used.length).toBeGreaterThan(0);
    for (const hex of used) expect(css.toLowerCase()).toContain(hex.toLowerCase());
  });

  it("by night the checked radio dot reads on the card (≥ 3:1)", () => {
    // Both single-choice styles: option cards and choice lists (one rule for both).
    expect(css).toMatch(/\.dark \.option-card input\[type="radio"\]:checked,\s*\.dark \.choice-row input\[type="radio"\]:checked \{\s*background: var\(--fg\);/);
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
  it("by night the feature card is a raised eggplant card with white type (a proposal: the concept shows light only)", () => {
    expect(ratio(dark["hero-fg"], dark.hero)).toBeGreaterThanOrEqual(7);
    expect(dark.hero).not.toBe(dark.bg);
    // Your own chat bubbles are a raised eggplant by night, with the ring in their own ink.
    expect(css).toMatch(/\.bubble-mine \{[^}]*?background: var\(--bubble-mine\);/);
    for (const th of [light, dark, sun]) expect(ratio(th["on-bubble-mine"], th["bubble-mine"])).toBeGreaterThanOrEqual(7);
    expect(dark["bubble-mine"]).not.toBe(dark.hero);
    expect(css).toMatch(/\.bubble-mine \* \{\s*--focus: currentColor;/);
    expect(ratio(dark["on-solid"], dark.solid)).toBeGreaterThanOrEqual(7);
  });
  it("the current Jobs view stands out from the switch's track (≥ 1.5:1)", () => {
    expect(css).toMatch(/\.segmented \{[^}]*?background: var\(--surface-2\);/);
    for (const th of [light, dark]) expect(ratio(th["tab-active-bg"], th["surface-2"])).toBeGreaterThanOrEqual(1.5);
  });
  it("the frame (shell) and the rail's current row, every mode (#111)", () => {
    for (const th of [light, dark, sun]) {
      // The current row is a step up from the frame (a subtle one, as on the concept's rail; the bold white label carries it), and its label reads.
      expect(ratio(th["shell-active"], th["shell-bg"])).toBeGreaterThanOrEqual(1.2);
      expect(ratio(th["on-shell-active"], th["shell-active"])).toBeGreaterThanOrEqual(7);
    }
    expect(light["shell-bg"]).toBe("#1c0f2e"); // the Eggplant frame, the same by night
    expect(dark["shell-bg"]).toBe("#1c0f2e");
    expect(sun["shell-bg"]).toBe("#000000");
    // By night a chosen chip has a light edge: visible against the chip and the card.
    expect(ratio(dark.muted, dark["tab-active-bg"])).toBeGreaterThanOrEqual(3);
    expect(ratio(dark.muted, dark.surface)).toBeGreaterThanOrEqual(3);
    // The dock's current tab is told by its green, not a bar or a tile.
    expect(css).not.toMatch(/\.tab\[aria-current\]::before \{/);
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
    // In the drawer the current row is the dock's capsule outside Sunlight (bold as well, so not colour alone); Sunlight keeps the solid tile above.
    expect(css).toMatch(/html:not\(\.sun\) \.more-sheet \.rail-link\[aria-current\] \{\s*background: var\(--dock-capsule\);\s*color: var\(--fg\);\s*box-shadow: none;/);
    expect(css).toMatch(/\.rail-link\[aria-current\] \{\s*@apply font-bold;/);
    // While the drawer is open the root takes its colour (the status bar's strip in an installed app). The rule must sit outside
    // every layer, on screen only: the root's own background is unlayered and would beat a layered rule; print keeps white.
    const rootRule = css.indexOf("html:has(.more-sheet[open]) {");
    expect(rootRule).toBeGreaterThan(-1);
    const before = css.slice(0, rootRule).replace(/\/\*[\s\S]*?\*\//g, "");
    const depthOf = (src: string) => src.split("{").length - src.split("}").length;
    expect(depthOf(before)).toBe(1); // inside @media screen only
    expect(before.slice(before.lastIndexOf("@media"))).toMatch(/^@media screen \{\s*$/);
    expect(css).toMatch(/html:has\(\.more-sheet\[open\]\) \{\s*background: var\(--drawer-root\);/);
    for (const body of [themeBody(css, ".sun"), css.slice(css.indexOf("@media (prefers-reduced-transparency: reduce)"))]) expect(body).toMatch(/--drawer-root: var\(--surface\);/);
    // The body takes it too, and the backdrop is clear: an iPhone colours the strip from the page or from whatever is fixed
    // across the top, and a dim backdrop made it a dark band (Caden's phone, Nov 11). The drawer's own shadow dims the page.
    expect(css).toMatch(/body:has\(\.more-sheet\[open\]\) \{\s*--page-wash: none;\s*background-color: var\(--drawer-root\);/);
    expect(css).toMatch(/\.more-sheet::backdrop \{\s*background: transparent;/);
    // No theme gives the backdrop a colour again (only the forced-colours veil does), and the colour is the pane over the page.
    expect(css.match(/\.more-sheet::backdrop/g)).toHaveLength(2);
    expect(css).toMatch(/--glass-bg-strong: color-mix\(in srgb, var\(--surface\) 79%, transparent\);/);
    expect(css).toMatch(/--drawer-root: color-mix\(in srgb, var\(--surface\) 79%, var\(--bg\)\);/);
    expect(css).toMatch(/--glass-bg-strong: color-mix\(in srgb, var\(--surface\) 78%, transparent\);\s*--drawer-root: color-mix\(in srgb, var\(--surface\) 78%, var\(--bg\)\);/);
    expect(css).toMatch(/\.more-sheet \{[^}]*border-end-end-radius: var\(--radius-lg\);\s*box-shadow: 0 0 0 100vmax rgb\(24 20 30 \/ 0\.45\);/);
    expect(css).toMatch(/\.dark \.more-sheet \{\s*box-shadow: 0 0 0 100vmax rgb\(8 4 14 \/ 0\.6\);/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{\s*\.more-sheet::backdrop \{\s*background: rgb\(0 0 0 \/ 0\.5\);/);
  });

  it("a chat thread on a phone has no dock: the composer sits at the bottom of the screen with nothing under it", () => {
    // Caden, Nov 11: the dock floated over an empty band under the message box. Unlayered and phone-only: from 768 there is no dock anyway.
    const at = css.indexOf("body:has(.thread-top) .tabbar {");
    expect(at).toBeGreaterThan(-1);
    const before = css.slice(0, at).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(before.split("{").length - before.split("}").length).toBe(1);
    expect(before.slice(before.lastIndexOf("@media"))).toMatch(/^@media \(max-width: 47\.99rem\) \{\s*$/);
    expect(css).toMatch(/body:has\(\.thread-top\) \.tabbar \{\s*display: none;/);
    expect(css).toMatch(/body:has\(\.thread-top\) \.composer \{\s*bottom: 0;\s*padding-bottom: calc\(0\.75rem \+ env\(safe-area-inset-bottom\)\);/);
    // The page ends at the composer and fills the screen, so a short conversation keeps it at the bottom.
    expect(css).toMatch(/body:has\(\.thread-top\) \.page \{\s*display: flex;\s*flex: 1 0 auto;\s*flex-direction: column;\s*padding-bottom: 0;/);
    expect(css).toMatch(/body:has\(\.thread-top\) \.composer \{\s*margin-top: auto;/);
    // ...in the organization's shell too, whose page wrapper is not a column by itself.
    expect(css).toMatch(/body:has\(\.thread-top\) #content \{\s*display: flex;\s*flex-direction: column;/);
    // A read-only thread has no composer: its last message keeps clear of the screen's edge.
    expect(css).toMatch(/body:has\(\.thread-top\):not\(:has\(\.composer\)\) \.page \{\s*padding-bottom: calc\(2rem \+ env\(safe-area-inset-bottom\)\);/);
  });

  it("every box that stands on the page has the card's weight; a box inside another stays flat", () => {
    // Caden, Nov 12: tiles, work cards, choice lists, option cards and empty states were flat beside the cards.
    const boxes = "\\.work-card, \\.shift-card, \\.turf-card, \\.need-tile, \\.stat, \\.stat-tile, \\.summary-item, \\.choice-list, \\.option-card, \\.empty-state, \\.overview-map";
    const inside = "\\.card, \\.card-flat, \\.list-card, \\.work-card, \\.hero-card, \\.sheet-panel, \\.more-sheet-panel";
    expect(css).toMatch(new RegExp(`\\n  :is\\(${boxes}\\) \\{\\s*box-shadow: var\\(--card-edge\\), var\\(--shadow-depth\\);`));
    expect(css).toMatch(new RegExp(`\\n  :is\\(${inside}\\) :is\\(${boxes}\\) \\{\\s*box-shadow: none;`));
    // A chosen option keeps its ring on top of the weight, and alone inside a card.
    expect(css).toMatch(/\.option-card:has\(input:checked\) \{\s*box-shadow: 0 0 0 1px var\(--selected\), var\(--card-edge\), var\(--shadow-depth\);/);
    expect(css).toMatch(new RegExp(`:is\\(${inside}\\) \\.option-card:has\\(input:checked\\) \\{\\s*box-shadow: 0 0 0 1px var\\(--selected\\);`));
    // One token for all of them, and they float: a faint contact shadow, then a long soft one thrown below the box. Sunlight has none (pinned above).
    expect(css).toMatch(/\n  --shadow-depth: 0 1px 2px rgb\(28 15 46 \/ 0\.05\), 0 6px 12px -4px rgb\(28 15 46 \/ 0\.1\), 0 22px 40px -16px rgb\(28 15 46 \/ 0\.3\);/);
    expect(themeBody(css, ".dark")).toMatch(/--shadow-depth: 0 1px 2px rgb\(0 0 0 \/ 0\.5\), 0 8px 16px -4px rgb\(0 0 0 \/ 0\.55\), 0 26px 48px -16px rgb\(0 0 0 \/ 0\.9\);/);
    // Paper has no shadows.
    expect(css).toMatch(/@media print \{[\s\S]*:is\(\.work-card, \.shift-card, \.turf-card, \.need-tile, \.stat-tile, \.summary-item, \.choice-list, \.option-card, \.overview-map\) \{ box-shadow: none; \}/);
    // Notes in the flow are not surfaces: they stay flat.
    for (const flat of [".card-flat", ".card-dashed", ".kv"]) expect(new RegExp(`\\n  \\${flat} \\{[^}]*box-shadow`).test(css)).toBe(false);
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

  it("tightens the statement's cells on screen between the stacked rows and 736, headers included", () => {
    const band = css.match(/@media screen and \(40rem <= width < 46rem\) \{([\s\S]*?)\n  \}\n/)?.[1] ?? "";
    // Two-part selector: it has to outrank `.data-table thead th` and `.data-table tbody th`, or headings sit 6px off their figures.
    expect(band).toMatch(/\.statement-lines :is\(thead, tbody\) :is\(th, td\) \{\s*@apply px-1\.5;/);
    expect(band).toMatch(/\.statement-lines tbody th\[scope="row"\] \{\s*@apply whitespace-normal;/);
    // The band starts where the stacked rows end.
    expect(css).toMatch(/@media \(width < 40rem\) \{\s*\/\*[^*]*\*\/\s*\.data-table-wrap:has\(> \.data-table-stack\)/);
  });

  it("the sheet's dialog never scrolls itself (the focus given on opening would scroll it while the panel is still below the edge)", () => {
    const sheet = css.match(/\n  \.sheet \{([^}]*)\}/)?.[1] ?? "";
    expect(sheet).toMatch(/overflow: visible;/);
    expect(css).toMatch(/\.sheet-body \{[^}]*overflow-x: hidden;/);
    expect(readFileSync(join(__dirname, "../components/Sheet.tsx"), "utf8")).toMatch(/showModal\(\);[\s\S]{0,200}scrollTop = 0/);
  });

  it("the bottom sheet's panel is solid, not blurred glass (a precaution: Safari has clipped a blur on an element that slides)", () => {
    const panel = css.match(/\n  \.sheet-panel \{([^}]*)\}/)?.[1] ?? "";
    expect(panel).toMatch(/background: var\(--surface\);/);
    expect(panel).not.toMatch(/backdrop-filter/);
    expect(css).toMatch(/\.sheet\[open\] \.sheet-panel \{\s*animation: tc-sheet-in/);
  });

  it("time and date fields take the width they are given (an iPhone draws them at a width of its own otherwise)", () => {
    expect(css).toMatch(/input\.field:is\(\[type="time"\], \[type="date"\], \[type="datetime-local"\], \[type="month"\]\) \{\s*-webkit-appearance: none;\s*appearance: none;\s*display: block;\s*min-width: 0;\s*max-width: 100%;/);
  });

  it("the stylesheet's braces balance (the regex checks here would not notice a stray one; the build would)", () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"\n]*"|'[^'\n]*'/g, "");
    expect(bare.split("{").length).toBe(bare.split("}").length);
  });

  it("tablets use the desktop layout: from 768 the sidebar shows and the dock, the menu strip and the header's menu button go (Nov 10)", () => {
    expect(css).toMatch(/@media \(min-width: 48rem\) \{\s*\.tabbar \{\s*display: none;/);
    expect(css).toMatch(/\.org-rail \{[^}]*?@apply [^;]*\bhidden\b[^;]*\bmd:flex;/);
    expect(css).toMatch(/@media \(min-width: 48rem\) \{\s*\.site-header \.menu-button \{\s*display: none;/);
    expect(css).toMatch(/\.phone-top \{\s*@apply [^;]*md:hidden;/);
    expect(css).toMatch(/\.site-header-worker \{\s*@apply hidden md:block;/);
    expect(css).toMatch(/@media \(width >= 48rem\) \{\s*body:has\(\.org-rail\) \.site-header \{\s*position: sticky;/);
    // Nothing is left of the touch-tablet dock (#136): one rule for every tablet.
    expect(css).not.toMatch(/data-touch-dock/);
    const appNav = readFileSync(join(__dirname, "../components/AppNav.tsx"), "utf8");
    expect(appNav).not.toMatch(/TOUCH_TABLET_QUERY|touchDock/);
    // The drawer closes on the same width the dock goes at, and nothing hides it by width.
    expect(appNav).toMatch(/matchMedia\("\(min-width: 48rem\)"\)/);
    expect(css).not.toMatch(/\.more-sheet[^{,]*\{[^}]*display:\s*none/);
    expect(appNav).toMatch(/className="more-sheet"/);
    // A worker gets the sidebar too: the layout draws the same shell with the dock's tabs and the drawer's places.
    const layout = readFileSync(join(__dirname, "../app/layout.tsx"), "utf8");
    expect(layout).toMatch(/<OrgRail tabs=\{\[\.\.\.tabs, \.\.\.workerMore\(session\.role\)\]\}/);
    // While a field takes typing on a touch device the dock still steps aside (phones only now).
    expect(css).toMatch(/@media \(max-width: 47\.99rem\) and \(pointer: coarse\) \{\s*body:has\(\.composer-input:focus\) \.tabbar/);
    // The sidebar is glass outside Sunlight: ink type on the pane.
    expect(css).toMatch(/html:not\(\.sun\) \.org-rail \{[^}]*?--shell-fg: var\(--fg\);[^}]*?background: var\(--glass-sheen\), var\(--glass-bg-bar\);/);
  });

  it("gives the staff console its own band and never an organization's rail beside it", () => {
    expect(css).toMatch(/\.staff-band \{[^}]*background: var\(--shell-bg\);[^}]*color: var\(--shell-fg\);/);
    expect(css).toMatch(/\.staff-band \* \{\s*--focus: var\(--shell-fg\);/);
    expect(css).toMatch(/body:has\(\.staff-band\) \.org-rail:not\(\.staff-rail\) \{\s*display: none;/);
    // A staff login's worker top bar and dock step aside on admin pages, at every width (#135).
    expect(css).toMatch(/body:has\(\.staff-band\) :is\(\.site-header nav\[aria-label="Main"\], \.tabbar\) \{\s*display: none;/);
  });
});
