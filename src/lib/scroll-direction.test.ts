import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PHOTO_PAST_PX, SCROLLED_PX, SCROLL_JITTER_PX, SCROLL_TOP_PX, clampScroll, isScrolled, photoPassed, scrollDirection } from "./scroll-direction";

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
    expect(component).toMatch(/mark\(last\);/);
    expect(component.indexOf("mark(last);")).toBeLessThan(component.indexOf('window.addEventListener("scroll"'));
    const css = read("app/globals.css");
    expect(css).toMatch(/\nhtml:not\(\[data-scrolled\], \.sun\) \.phone-top::before,\s*html:not\(\[data-scrolled\], \.sun\) body:not\(:has\(\.staff-band, \.thread-top\)\)::after \{\s*opacity: 0;\s*\}/);
    expect(css).toMatch(/\n\.phone-top::before \{\s*transition: opacity var\(--dur-base\) var\(--ease-standard\);/);
    // With reduced transparency or more contrast the bar is a plain surface, not glass: it stays, as Sunlight's does.
    const solid = css.slice(css.lastIndexOf("@media (prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active) {"));
    expect(solid).toMatch(/html:not\(\[data-scrolled\], \.sun\) body:not\(:has\(\.staff-band, \.thread-top\)\):not\(\.x\)::after \{\s*opacity: 1;/);
    // ...and a job page's strip under the clock stays on the way down too: there is no row for it to leave with.
    // Phone only: wider, a job's page keeps its header, and the bar must still leave with it.
    const stay = "html[data-past-photo]:not(.sun) body:has(.job-photo-head):has(.tpl):not(:has(.thread-top))::after {\n      opacity: 1 !important;";
    expect(solid.split(stay)).toHaveLength(2);
    expect(solid.slice(solid.lastIndexOf("@media", solid.indexOf(stay)), solid.indexOf(stay))).toMatch(/^@media \(width < 48rem\) \{/);
    expect(solid).toMatch(/html:not\(\.sun\) \.job-photo-head::after \{\s*background: rgb\(0 0 0 \/ 0\.5\);\s*-webkit-backdrop-filter: none;/);
    // Nothing keyed on the scroll marks changes a size or takes anything out of the page.
    expect(css).not.toMatch(/data-scrolled[^{]*\{[^}]*(height:|visibility: hidden|display: none)/);
    // A job's own page on a phone: no site bar and no menu strip. The photograph runs under the clock, its buttons
    // below the clock.
    const at = css.indexOf("body:has(.job-photo-head) :is(.site-header, .phone-top) {");
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(css.lastIndexOf("@media", at), css.indexOf("\n}\n", at));
    expect(block).toMatch(/^@media \(width < 48rem\) \{/);
    expect(block).toMatch(/:is\(\.site-header, \.phone-top\) \{\s*display: none;/);
    expect(block).toMatch(/\.tpl:has\(\.job-photo-head\) \{\s*padding-top: 0;/);
    expect(block).toMatch(/\.job-photo-head \{\s*margin-top: 0;\s*\}/);
    expect(block).toMatch(/\.job-head-actions \{\s*top: calc\(1rem \+ env\(safe-area-inset-top\)\);/);
    // Two panes share the top, one at a time (Caden, Nov 14). Over the photograph: clear glass under the clock, fixed
    // to the screen, a blur and a breath of shade with none of the page's colour, ending above the buttons.
    const clear = block.slice(block.indexOf("html:not(.sun) .job-photo-head::after {"));
    const clearRule = clear.slice(0, clear.indexOf("}"));
    expect(clearRule).toMatch(/position: fixed;\s*inset: 0 0 auto;\s*height: calc\(env\(safe-area-inset-top\) \* 1\.25\);/);
    expect(clearRule).toMatch(/backdrop-filter: blur\(12px\) saturate\(1\.3\);/);
    expect(clearRule).not.toContain("--page-top");
    expect(clearRule).toContain("pointer-events: none;");
    expect(block).toMatch(/html:not\(\.sun\)\[data-past-photo\] \.job-photo-head::after \{\s*opacity: 0;/);
    // 1.25 x the strip is under the buttons' top (the strip + 1rem) for any strip up to 64px.
    expect(59 * 1.25).toBeLessThan(59 + 16);
    // Past the photograph: the page's own gradient glass, hidden until then.
    const band = "html:not(.sun) body:has(.job-photo-head):has(.tpl):not(:has(.thread-top))::after {";
    const bandRule = block.slice(block.indexOf(band), block.indexOf("}", block.indexOf(band)));
    expect(bandRule).toMatch(/height: calc\(env\(safe-area-inset-top\) \+ 2\.25rem\);/);
    expect(bandRule).toMatch(/var\(--page-top\)[\s\S]*backdrop-filter: blur\(10px\);[\s\S]*opacity: 0;/);
    expect(block).toMatch(/html:not\(\.sun\)\[data-past-photo\] body:has\(\.job-photo-head\):has\(\.tpl\):not\(:has\(\.thread-top\)\)::after \{\s*opacity: 1;/);
    // The two stand in for the cap under the clock; Sunlight has neither and keeps its cap.
    expect(block).toMatch(/html:not\(\.sun\):has\(\.job-photo-head\)::after \{\s*opacity: 0;/);
    expect(block).toMatch(/html\.sun body:has\(\.job-photo-head\):has\(\.tpl\):not\(:has\(\.thread-top\)\)::after \{\s*content: none;/);
    // The mark that switches them: a photograph whose foot is above the strip has passed.
    expect(photoPassed(null)).toBe(false);
    expect(photoPassed(PHOTO_PAST_PX + 1)).toBe(false);
    expect(photoPassed(PHOTO_PAST_PX)).toBe(true);
    expect(photoPassed(-200)).toBe(true);
    expect(component).toMatch(/if \(past\) root\.dataset\.pastPhoto = "";\s*else delete root\.dataset\.pastPhoto;/);
    // Read again on a change of page and once it has settled: a new page arrives at its top with no scroll to say so.
    expect(component).toMatch(/\}, \[pathname\]\);/);
    expect(component).toMatch(/window\.setTimeout\(\(\) => mark\(at\(\)\), 400\)/);
    // The way back is the arrow on the photograph, a real link.
    expect(readFileSync(join(__dirname, "../components/JobHeadActions.tsx"), "utf8")).toMatch(/<Link[^>]*href=\{back\}/);
    expect(readFileSync(join(__dirname, "../app/layout.tsx"), "utf8")).toContain('statusBarStyle: "black-translucent"');
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
