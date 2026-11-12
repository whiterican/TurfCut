import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

describe("the typeface is served from the repository", () => {
  const fonts = readFileSync(join(__dirname, "fonts.ts"), "utf8");
  const paths = [...fonts.matchAll(/src: "(\.\/fonts\/[^"]+)"/g)].map((m) => m[1]);

  it("nothing downloads a font from Google at build time", () => {
    const offenders = files(SRC).filter((f) => /from ["']next\/font\/google["']/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("every subset names a file that is there, with the licence beside it", () => {
    expect(paths).toHaveLength(7);
    for (const p of paths) expect(existsSync(join(__dirname, p)), p).toBe(true);
    expect(readFileSync(join(__dirname, "fonts/OFL.txt"), "utf8")).toMatch(/SIL Open Font License, Version 1\.1/);
  });

  it("every subset is one family with its own range, at the weights the type scale uses", () => {
    expect(fonts.match(/\{ prop: "font-family", value: "inter" \}/g)).toHaveLength(7);
    expect(fonts.match(/\{ prop: "unicode-range", value: "U\+[^"]+" \}/g)).toHaveLength(7);
    expect(fonts.match(/weight: "500 800"/g)).toHaveLength(7);
  });

  it("each file is paired with its own script's range, and Latin is declared last", () => {
    const calls = [...fonts.matchAll(/export const (\w+) = localFont\(\{\s*src: "\.\/fonts\/inter-([a-z-]+)\.woff2",[\s\S]*?unicode-range", value: "(U\+[0-9A-F]{4})/g)].map((m) => [m[1], m[2], m[3]]);
    expect(calls).toEqual([
      ["interCyrillicExt", "cyrillic-ext", "U+0460"],
      ["interCyrillic", "cyrillic", "U+0301"],
      ["interGreekExt", "greek-ext", "U+1F00"],
      ["interGreek", "greek", "U+0370"],
      ["interVietnamese", "vietnamese", "U+0102"],
      ["interLatinExt", "latin-ext", "U+0100"],
      // The loader names the family after this constant; --font-inter resolves through it.
      ["inter", "latin", "U+0000"],
    ]);
    for (const p of paths) expect(readFileSync(join(__dirname, p)).subarray(0, 4).toString("latin1"), p).toBe("wOF2");
  });

  it("only Latin is preloaded and carries the CSS variable", () => {
    expect(fonts.match(/variable: "--font-inter"/g)).toHaveLength(1);
    expect(fonts).toMatch(/export const inter = localFont\(\{\s*src: "\.\/fonts\/inter-latin\.woff2",\s*weight: "500 800",\s*display: "swap",\s*variable: "--font-inter",\s*declarations/);
    expect(fonts.match(/preload: false/g)).toHaveLength(6);
  });
});
