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

  it("only Latin is preloaded and carries the CSS variable", () => {
    expect(fonts.match(/variable: "--font-inter"/g)).toHaveLength(1);
    expect(fonts.match(/preload: false/g)).toHaveLength(6);
  });
});
