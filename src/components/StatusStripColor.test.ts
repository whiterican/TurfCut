import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "StatusStripColor.tsx"), "utf8");
const layout = readFileSync(join(__dirname, "../app/layout.tsx"), "utf8");

describe("the phone's status strip follows the theme", () => {
  it("is mounted once, in the root layout", () => {
    expect(layout.match(/<StatusStripColor \/>/g)).toHaveLength(1);
  });
  it("copies the root's painted colour into the theme-color tag", () => {
    expect(src).toMatch(/meta\[name="theme-color"\]/);
    expect(src).toMatch(/getComputedStyle\(root\)\.backgroundColor/);
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
    // The install's own colours match the night page, not the old eggplant.
    const manifest = readFileSync(join(__dirname, "../app/manifest.ts"), "utf8");
    expect(manifest).toMatch(/background_color: "#3c1f66",\s*theme_color: "#3c1f66",/);
  });
});
