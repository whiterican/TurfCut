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
  it("does not set a fixed colour in the layout that would fight it", () => {
    expect(layout).not.toMatch(/themeColor/);
  });
});
