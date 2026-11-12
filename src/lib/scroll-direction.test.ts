import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCROLL_JITTER_PX, SCROLL_TOP_PX, clampScroll, scrollDirection } from "./scroll-direction";

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

  it("is wired: the component marks the root, the layout mounts it, and the row hides without leaving the keyboard's reach", () => {
    const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
    const component = read("components/ScrollDirection.tsx");
    expect(component).toMatch(/document\.documentElement\.dataset\.scroll = /);
    expect(component).toMatch(/clampScroll\(window\.scrollY, /);
    expect(read("app/layout.tsx")).toMatch(/<ScrollDirection \/>/);
    const css = read("app/globals.css");
    // The whole row goes on the way down, except in a chat (which scrolls itself to the newest message) and
    // while the keyboard is on one of its controls. Faded and moved, never removed.
    expect(css).toMatch(/html\[data-scroll="down"\]:not\(:has\(\.thread-top\)\) \.site-header:not\(:has\(:focus-visible\)\) \{\s*opacity: 0;\s*translate: 0 -100%;\s*pointer-events: none;/);
    expect(css).toMatch(/html\[data-scroll="down"\]:not\(:has\(\.thread-top\)\) \.phone-top > :not\(:focus-visible\) \{\s*opacity: 0;\s*translate: 0 -150%;\s*pointer-events: none;/);
    // The glass the row sat on shrinks to a short feather; the plain bars (Sunlight, staff, the solid fallback) go with the row.
    expect(css).toMatch(/html\[data-scroll="down"\]:not\(:has\(\.thread-top\)\) body::after \{\s*height: 2\.25rem !important;/);
    expect(css).toMatch(/html\[data-scroll="down"\]:not\(:has\(\.thread-top\)\) \.phone-top::before \{\s*height: calc\(2\.25rem \+ env\(safe-area-inset-top\)\) !important;/);
    expect(css).toMatch(/html\.sun\[data-scroll="down"\]:not\(:has\(\.thread-top\)\) body::after,\s*html\[data-scroll="down"\]:not\(:has\(\.thread-top\)\) body:has\(\.staff-band\)::after \{\s*opacity: 0 !important;/);
    expect(css.slice(css.indexOf("@media (prefers-reduced-transparency: reduce)"))).toMatch(/html\[data-scroll="down"\]:not\(:has\(\.thread-top\)\) body::after \{\s*opacity: 0 !important;/);
    expect(css).not.toMatch(/data-scroll[^{]*\{[^}]*(visibility: hidden|display: none)/);
  });
});
