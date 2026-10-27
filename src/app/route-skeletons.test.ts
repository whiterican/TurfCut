import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PageSkeleton, SKELETON_SHAPES } from "@/components/PageSkeleton";

/**
 * P1.3: every route shows a skeleton of its own layout the moment it opens.
 * The exceptions must answer with real status codes, which a loading screen
 * would hide behind a streamed 200:
 *   - the offline brief's field routes (Today and the Shifts pages) and the
 *     root above them (field-routes-status.test.ts);
 *   - the public campaign pages (the directory, each campaign and its posts),
 *     which campaigns share as links: a deleted one must be a real 404 to
 *     link checkers and monitors. The directory is exempt too, because a
 *     loading screen there would also wrap every campaign page below it.
 */
const APP = join(__dirname);
const NO_SKELETON = ["", "dashboard", "shifts", "c"]; // "" = the root page; the others include everything below them
const PAGE = /^page\.(tsx|ts|jsx|js|mdx)$/;

function pageDirs(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (!statSync(p).isDirectory()) return [];
    if (f === "zz-preview" || (dir === APP && f === "api")) return [];
    return [...(readdirSync(p).some((x) => PAGE.test(x)) ? [p] : []), ...pageDirs(p)];
  });
}

/** The URL path of a page folder: route groups "(name)" don't appear in it. */
const route = (dir: string) => relative(APP, dir).split(sep).filter((x) => !/^\(.*\)$/.test(x)).join("/");
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
      const shapes = [...src.matchAll(/\bshape="([a-z]+)"/g)].map((m) => m[1]);
      if (!src.includes("<PageSkeleton") || !shapes.length || shapes.some((x) => !(SKELETON_SHAPES as readonly string[]).includes(x))) wrong.push(`/${r}`);
      // The staff console's layout draws the page and its heading: its skeletons must not add a second main.
      if (r.startsWith("admin") && !src.includes("framed={false}")) wrong.push(`/${r} (needs framed={false})`);
    }
    expect(missing, "add a loading.tsx that renders <PageSkeleton shape=…>").toEqual([]);
    expect(wrong, "loading.tsx must render <PageSkeleton> with one of SKELETON_SHAPES").toEqual([]);
  });

  it("leaves the field routes, the root and the public campaign pages without one, on themselves or above them", () => {
    const boundary = (dir: string) => readdirSync(dir).some((f) => /^(loading|template)\.(tsx|ts|jsx|js)$/.test(f));
    for (const d of dirs.filter((x) => exempt(route(x)))) {
      // A loading screen wraps everything below it, so every folder up to the app root counts.
      for (let up = d; up.startsWith(APP); up = join(up, "..")) expect(boundary(up), `/${route(d)} is wrapped by ${relative(APP, up) || "the root"}`).toBe(false);
    }
  });

  it("draws every shape as a busy, labelled placeholder", () => {
    for (const shape of SKELETON_SHAPES) {
      const html = renderToStaticMarkup(createElement(PageSkeleton, { shape, label: "Loading jobs" }));
      expect(html).toMatch(/^<main class="page" aria-busy="true" aria-label="Loading jobs">/);
      expect(html).toContain('class="skeleton');
    }
    expect(renderToStaticMarkup(createElement(PageSkeleton, { shape: "form", width: "narrow" }))).toMatch(/^<main class="page-narrow flex flex-1 flex-col justify-center gap-6"/);
    expect(renderToStaticMarkup(createElement(PageSkeleton, { shape: "thread", width: "2xl", gap: 4 }))).toMatch(/^<main class="page max-w-2xl space-y-4"/);
  });

  it("draws an unframed skeleton as a plain block with no heading, for the staff console", () => {
    const html = renderToStaticMarkup(createElement(PageSkeleton, { shape: "list", framed: false, label: "Loading people" }));
    expect(html).toMatch(/^<div class="space-y-10" role="status" aria-busy="true" aria-label="Loading people">/);
    expect(html).not.toContain("<main");
    expect(html).not.toContain("h-8 w-48"); // the heading bars
  });

  it("gives people lists a face per row and drops the filter row where a page has none", () => {
    expect(renderToStaticMarkup(createElement(PageSkeleton, { shape: "list", avatars: true }))).toContain("size-10");
    expect(renderToStaticMarkup(createElement(PageSkeleton, { shape: "cards", filters: false }))).not.toContain("h-9 w-20 rounded-full");
  });
});
