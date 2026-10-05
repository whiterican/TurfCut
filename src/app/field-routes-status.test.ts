import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The offline brief (public/sw.js) saves Today and the Shifts pages and
 * relies on their real status codes: a redirect wipes the saved pages, a 500
 * serves the saved copy, a 404 drops it. A loading screen or Suspense
 * boundary on these routes, or above them, would stream a 200 first and
 * hide all three.
 */
const APP = join(__dirname);
const FIELD_DIRS = ["dashboard", "shifts"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("field routes answer with real status codes", () => {
  it("have no loading screen, on themselves or above them", () => {
    expect(existsSync(join(APP, "loading.tsx"))).toBe(false);
    for (const d of FIELD_DIRS) {
      const found = files(join(APP, d)).filter((f) => /\/loading\.(t|j)sx?$/.test(f));
      expect(found, `remove ${found.join(", ")}`).toEqual([]);
    }
  });

  it("render no Suspense boundary, and neither does the root layout", () => {
    const sources = [join(APP, "layout.tsx"), ...FIELD_DIRS.flatMap((d) => files(join(APP, d)))].filter((f) => /\.(t|j)sx?$/.test(f) && !/\.test\./.test(f));
    const withSuspense = sources.filter((f) => /\bSuspense\b/.test(readFileSync(f, "utf8")));
    expect(withSuspense).toEqual([]);
  });
});
