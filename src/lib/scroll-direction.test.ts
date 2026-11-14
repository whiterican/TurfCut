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
    // With reduced transparency or more contrast the bar is a plain surface, not glass: it stays, as Sunlight's does.
    const solid = css.slice(css.lastIndexOf("@media (prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active) {"));
    expect(solid).toMatch(/html:not\(\[data-scrolled\], \.sun\) body:not\(:has\(\.staff-band, \.thread-top\), \.x\)::after \{\s*opacity: 1;/);
    // Nothing keyed on the scroll marks changes a size or takes anything out of the page.
    expect(css).not.toMatch(/data-scrolled[^{]*\{[^}]*(height:|visibility: hidden|display: none)/);
    // A job's own page on a phone: no site bar, no menu strip, no glass. The photograph runs under the clock, its
    // buttons below the clock, and the cap under the clock waits for a scroll.
    const at = css.indexOf("body:has(.job-photo-head) :is(.site-header, .phone-top) {");
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(css.lastIndexOf("@media", at), css.indexOf("\n}\n", at));
    expect(block).toMatch(/^@media \(width < 48rem\) \{/);
    expect(block).toMatch(/:is\(\.site-header, \.phone-top\) \{\s*display: none;/);
    expect(block).toMatch(/body:has\(\.job-photo-head\)::after \{\s*content: none;/);
    expect(block).toMatch(/\.tpl:has\(\.job-photo-head\) \{\s*padding-top: 0;/);
    expect(block).toMatch(/\.job-photo-head \{\s*margin-top: 0;\s*\}/);
    expect(block).toMatch(/\.job-head-actions \{\s*top: calc\(1rem \+ env\(safe-area-inset-top\)\);/);
    expect(block).toMatch(/html:has\(\.job-photo-head\):not\(\[data-scrolled\]\)::after \{\s*opacity: 0;/);
    // The clock is always white (black-translucent): the strip under it is shaded so a pale photograph cannot hide it.
    expect(block).toMatch(/\.job-photo-head::after \{[^}]*height: calc\(env\(safe-area-inset-top\) \* 1\.4\);\s*pointer-events: none;\s*background: linear-gradient\(to bottom, rgb\(0 0 0 \/ 0\.42\)/);
    expect(readFileSync(join(__dirname, "../app/layout.tsx"), "utf8")).toContain('statusBarStyle: "black-translucent"');
    // The way back is the arrow on the photograph, a real link.
    expect(readFileSync(join(__dirname, "../components/JobHeadActions.tsx"), "utf8")).toMatch(/<Link[^>]*href=\{back\}/);
    // Taller by the clock's strip, but only on a tall screen: these selectors outweigh the short-screen height.
    expect(css).toMatch(/@media \(width < 40rem\) and \(min-height: 34\.01rem\) \{\s*body:has\(\.job-photo-head\) \.job-photo-head \{\s*height: calc\(200px \+ env\(safe-area-inset-top\)\);/);
    expect(css).toMatch(/@media \(width >= 40rem\) and \(width < 48rem\) and \(min-height: 34\.01rem\) \{\s*body:has\(\.job-photo-head\) \.job-photo-head \{\s*height: calc\(260px \+ env\(safe-area-inset-top\)\);/);
    expect(css).not.toMatch(/@media \(width < 48rem\) \{[^@]*\.job-photo-head \{[^}]*height:/);
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
