import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FLAT_STRIP_MEDIA, STRIP_COLORS, STRIP_COLORS_FLAT } from "@/lib/theme";

const src = readFileSync(join(__dirname, "StatusStripColor.tsx"), "utf8");
const layout = readFileSync(join(__dirname, "../app/layout.tsx"), "utf8");

describe("the phone's status strip follows the theme", () => {
  it("is mounted once, in the root layout", () => {
    expect(layout.match(/<StatusStripColor \/>/g)).toHaveLength(1);
  });
  it("copies the strip's colour (--root-top) into the theme-color tag, not the root's own foot colour", () => {
    expect(src).toMatch(/meta\[name="theme-color"\]/);
    expect(src).toMatch(/getComputedStyle\(root\)\.getPropertyValue\("--root-top"\)/);
  });
  it("reads again when the theme's classes change, the phone's own theme changes, or the page does", () => {
    expect(src).toMatch(/watcher\.observe\(root, \{ attributes: true, attributeFilter: \["class"/);
    expect(src).toMatch(/matchMedia\("\(prefers-color-scheme: light\)"\)/);
    expect(src).toMatch(/\}, \[pathname\]\);/);
  });
  it("has a colour in the page as it arrives, for devices that read it once, and keeps every tag on the page's real colour", () => {
    // The page's top colour by day and by night: the same values as --page-top.
    const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
    expect(css).toMatch(/\n  --page-top: #d6c9ea;/);
    expect(css).toMatch(/\n  --page-top: #3c1f66;/);
    expect(layout).toContain('{ media: "(prefers-color-scheme: light)", color: "#d6c9ea" }');
    expect(layout).toContain('{ media: "(prefers-color-scheme: dark)", color: "#3c1f66" }');
    // Two tags now: the component writes to all of them, or the one the device reads could keep its first value.
    expect(src).toMatch(/document\.querySelectorAll<HTMLMetaElement>\('meta\[name="theme-color"\]'\)/);
    expect(src).toMatch(/for \(const tag of tags\(\)\) if \(tag\.content !== plain\) tag\.content = plain;/);
    // Fresh tags arriving in the head (the framework remounts it on some navigations) are rewritten too.
    expect(src).toMatch(/arrivals\.observe\(document\.head, \{ childList: true \}\);/);
    // The install's own colours match the night page, not the old eggplant.
    const manifest = readFileSync(join(__dirname, "../app/manifest.ts"), "utf8");
    expect(manifest).toMatch(/background_color: "#3c1f66",\s*theme_color: "#3c1f66",/);
  });
  it("the pre-paint script's strip colours are the stylesheet's page tops, Sunlight's included", () => {
    const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
    expect(css).toContain(`\n  --page-top: ${STRIP_COLORS.light};`);
    expect(css).toContain(`\n  --page-top: ${STRIP_COLORS.dark};`);
    // Sunlight's page top is its own background (--page-top: var(--bg) in the .sun block).
    const sun = css.slice(css.indexOf("\n.sun {"), css.indexOf("\n}", css.indexOf("\n.sun {")));
    expect(sun).toContain(`--bg: ${STRIP_COLORS.sun};`);
    expect(sun).toContain("--page-top: var(--bg);");
    // The layout's own tags stay on the phone's light and dark (the script, not the server, knows the app's theme),
    // and the script that corrects them runs in the head.
    expect(layout).toContain(`{ media: "(prefers-color-scheme: light)", color: "${STRIP_COLORS.light}" }`);
    expect(layout).toContain(`{ media: "(prefers-color-scheme: dark)", color: "${STRIP_COLORS.dark}" }`);
    expect(layout).toMatch(/<head>\s*<InlineScript html=\{THEME_INIT_SCRIPT\} \/>/);
  });
  it("under the contrast settings the strip is each theme's flat background, the stylesheet's own query and colours", () => {
    const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
    // The stylesheet flattens the page top to --bg under exactly this query.
    const at = css.indexOf(`@media ${FLAT_STRIP_MEDIA} {`);
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, at + 3000)).toContain("--page-top: var(--bg);");
    expect(css).toContain(`\n  --bg: ${STRIP_COLORS_FLAT.light}; /* = Cream */`);
    expect(css).toContain(`\n  --bg: ${STRIP_COLORS_FLAT.dark};`);
    expect(STRIP_COLORS_FLAT.sun).toBe(STRIP_COLORS.sun);
  });
});
