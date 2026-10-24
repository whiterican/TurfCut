import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PageSkeleton, SKELETON_SHAPES } from "@/components/PageSkeleton";

/**
 * P1.3: every route shows a skeleton of its own layout the moment it opens.
 * The exceptions are the offline brief's field routes (Today and the Shifts
 * pages) and the root above them: they must answer with real status codes,
 * so they carry no loading screen at all (field-routes-status.test.ts).
 */
const APP = join(__dirname);
const NO_SKELETON = ["", "dashboard", "shifts"]; // "" = the root page; dashboard and shifts include everything below them

function pageDirs(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (!statSync(p).isDirectory()) return [];
    if (f === "zz-preview" || f === "api") return [];
    return [...(existsSync(join(p, "page.tsx")) ? [p] : []), ...pageDirs(p)];
  });
}

const route = (dir: string) => relative(APP, dir).split(sep).join("/");
const exempt = (r: string) => NO_SKELETON.some((x) => (x === "" ? r === "" : r === x || r.startsWith(`${x}/`)));

describe("route skeletons (P1.3)", () => {
  const dirs = pageDirs(APP);

  it("finds the app's pages", () => {
    expect(dirs.length).toBeGreaterThan(50);
  });

  it("gives every page outside the field routes its own loading skeleton, naming a known shape", () => {
    const missing: string[] = [];
    const wrong: string[] = [];
    for (const d of dirs) {
      const r = route(d);
      if (exempt(r)) continue;
      const f = join(d, "loading.tsx");
      if (!existsSync(f)) {
        missing.push(`/${r}`);
        continue;
      }
      const src = readFileSync(f, "utf8");
      const shape = src.match(/<PageSkeleton\b[^>]*\bshape="([a-z]+)"/)?.[1];
      if (!shape || !(SKELETON_SHAPES as readonly string[]).includes(shape)) wrong.push(`/${r}`);
    }
    expect(missing, "add a loading.tsx that renders <PageSkeleton shape=…>").toEqual([]);
    expect(wrong, "loading.tsx must render <PageSkeleton> with one of SKELETON_SHAPES").toEqual([]);
  });

  it("leaves the field routes and the root without one", () => {
    expect(existsSync(join(APP, "loading.tsx"))).toBe(false);
    for (const d of dirs.filter((x) => exempt(route(x)))) expect(existsSync(join(d, "loading.tsx")), `/${route(d)}`).toBe(false);
  });

  it("draws every shape as a busy, labelled placeholder", () => {
    for (const shape of SKELETON_SHAPES) {
      const html = renderToStaticMarkup(createElement(PageSkeleton, { shape, label: "Loading jobs" }));
      expect(html).toMatch(/^<main class="page" aria-busy="true" aria-label="Loading jobs">/);
      expect(html).toContain('class="skeleton');
    }
    expect(renderToStaticMarkup(createElement(PageSkeleton, { shape: "form", width: "narrow" }))).toMatch(/^<main class="page-narrow space-y-6"/);
  });
});
