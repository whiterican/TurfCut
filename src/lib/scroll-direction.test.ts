import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCROLLED_PX, SCROLL_JITTER_PX, SCROLL_TOP_PX, clampScroll, isScrolled, scrollDirection } from "./scroll-direction";

describe("scroll direction for the top row", () => {
  it("is down on a clear move down and up on a clear move up", () => {
    expect(scrollDirection(100, 140)).toBe("down");
    expect(scrollDirection(400, 360)).toBe("up");
  });

  it("ignores a wobble", () => {
    expect(scrollDirection(200, 200 + SCROLL_JITTER_PX - 1)).toBeNull();
    expect(scrollDirection(200, 200 - SCROLL_JITTER_PX + 1)).toBeNull();
  });

  it("always shows at the top of the page, even mid-way down a bounce", () => {
    expect(scrollDirection(0, SCROLL_TOP_PX)).toBe("up");
    expect(scrollDirection(300, 10)).toBe("up");
    expect(scrollDirection(-20, 0)).toBe("up");
  });

  it("does not take a rubber-band past the end of the page for a scroll up", () => {
    const max = 1000;
    // Overscrolled to 1040, the page springs back to 1000: clamped, nothing moved.
    expect(scrollDirection(clampScroll(1040, max), clampScroll(1000, max))).toBeNull();
    expect(clampScroll(-30, max)).toBe(0);
    expect(clampScroll(50, -5)).toBe(0);
  });

  it("knows when the page has left its top, which is when the glass across the top has something to blur", () => {
    expect(isScrolled(0)).toBe(false);
    expect(isScrolled(SCROLLED_PX)).toBe(false);
    expect(isScrolled(SCROLLED_PX + 1)).toBe(true);
    // Sooner than the top row steps aside: the glass is there before anything reaches the clock.
    expect(SCROLLED_PX).toBeLessThan(SCROLL_TOP_PX);
  });

  it("shows the glass only once the page has left its top, and never resizes or removes it", () => {
    // Caden, Nov 14: at rest it lay over a job's photograph and the buttons on it, and over pages' own top buttons.
    const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
    const component = read("components/ScrollDirection.tsx");
    expect(component).toMatch(/if \(is\) root\.dataset\.scrolled = "";\s*else delete root\.dataset\.scrolled;/);
    // A reload restored part-way down has no scroll event to say so: the first read is at mount.
    expect(component).toMatch(/mark\(last\);\s*window\.addEventListener\("scroll"/);
    const css = read("app/globals.css");
    expect(css).toMatch(/\nhtml:not\(\[data-scrolled\], \.sun\) \.phone-top::before,\s*html:not\(\[data-scrolled\], \.sun\) body:not\(:has\(\.staff-band, \.thread-top\)\)::after \{\s*opacity: 0;\s*\}/);
    expect(css).toMatch(/\n\.phone-top::before \{\s*transition: opacity var\(--dur-base\) var\(--ease-standard\);/);
    // Nothing keyed on the scroll marks changes a size or takes anything out of the page.
    expect(css).not.toMatch(/data-scrolled[^{]*\{[^}]*(height:|visibility: hidden|display: none)/);
    // A worker's job page: the photograph runs under the clock, its buttons below the clock, and the cap waits for a scroll.
    const at = css.indexOf("body:has(.site-header-worker) .tpl:has(.job-photo-head) {");
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(css.lastIndexOf("@media", at), css.indexOf("\n}\n", at));
    expect(block).toMatch(/^@media \(width < 48rem\) \{/);
    expect(block).toMatch(/\.tpl:has\(\.job-photo-head\) \{\s*padding-top: 0;/);
    expect(block).toMatch(/\.job-photo-head \{\s*margin-top: 0;\s*height: calc\(200px \+ env\(safe-area-inset-top\)\);/);
    expect(block).toMatch(/\.job-head-actions \{\s*top: calc\(1rem \+ env\(safe-area-inset-top\)\);/);
    expect(block).toMatch(/html:has\(\.site-header-worker\):has\(\.job-photo-head\):not\(\[data-scrolled\]\)::after \{\s*opacity: 0;/);
    // The short-screen height comes after it, so a phone held on its side keeps the short photograph.
    expect(css.indexOf("\n@media (max-height: 34rem) {\n  .job-photo-head {")).toBeGreaterThan(at);
  });

  it("is wired: the component marks the root, the layout mounts it, and the row hides without leaving the keyboard's reach", () => {
    const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
    const component = read("components/ScrollDirection.tsx");
    expect(component).toMatch(/document\.documentElement\.dataset\.scroll = /);
    expect(component).toMatch(/clampScroll\(window\.scrollY, /);
    expect(read("app/layout.tsx")).toMatch(/<ScrollDirection \/>/);
    const css = read("app/globals.css");
    // The whole row goes on the way down, except in a chat (which scrolls itself to the newest message) and
    // while the keyboard is on one of its controls. Faded and moved, never removed.
    expect(css).toMatch(/html\[data-scroll="down"\]:not\(:has\(\.thread-top\)\) \.site-header:not\(:has\(:focus-visible\)\) \{\s*opacity: 0;\s*translate: 0 -0\.375rem;\s*pointer-events: none;/);
    expect(css).toMatch(/html\[data-scroll="down"\]:not\(:has\(\.thread-top\)\) \.phone-top > :not\(:focus-visible\) \{\s*opacity: 0;\s*translate: 0 -0\.375rem;\s*pointer-events: none;/);
    // The glass stays while the row is away (it is never resized by the scroll); the plain bars (Sunlight, staff, the solid fallback) go with the row.
    expect(css).not.toMatch(/data-scroll[^{]*\{[^}]*height:/);
    expect(css).toMatch(/html\.sun\[data-scroll="down"\]:not\(:has\(\.thread-top\)\) body::after,\s*html\[data-scroll="down"\]:not\(:has\(\.thread-top\)\) body:has\(\.staff-band\)::after \{\s*opacity: 0 !important;/);
    expect(css.slice(css.indexOf("@media (prefers-reduced-transparency: reduce)"))).toMatch(/html\[data-scroll="down"\]:not\(:has\(\.thread-top\)\) body::after \{\s*opacity: 0 !important;/);
    expect(css).not.toMatch(/data-scroll[^{]*\{[^}]*(visibility: hidden|display: none)/);
  });
});
