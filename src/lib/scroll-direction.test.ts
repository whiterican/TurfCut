import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCROLL_JITTER_PX, SCROLL_TOP_PX, scrollDirection } from "./scroll-direction";

describe("scroll direction for the top-bar buttons", () => {
  it("is down on a clear move down and up on a clear move up", () => {
    expect(scrollDirection(100, 140, "up")).toBe("down");
    expect(scrollDirection(400, 360, "down")).toBe("up");
  });

  it("ignores a wobble", () => {
    expect(scrollDirection(200, 200 + SCROLL_JITTER_PX - 1, "up")).toBeNull();
    expect(scrollDirection(200, 200 - SCROLL_JITTER_PX + 1, "down")).toBeNull();
  });

  it("always shows at the top of the page, even mid-way down a bounce", () => {
    expect(scrollDirection(0, SCROLL_TOP_PX, "down")).toBe("up");
    expect(scrollDirection(300, 10, "down")).toBe("up");
    expect(scrollDirection(-20, 0, "down")).toBe("up");
  });

  it("is wired: the component marks the root, the header's buttons carry the class, and the layout mounts it", () => {
    const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
    expect(read("components/ScrollDirection.tsx")).toMatch(/document\.documentElement\.dataset\.scroll = /);
    expect(read("components/SiteHeader.tsx")).toMatch(/className="site-header-actions flex items-center gap-\[8px\]"/);
    expect(read("app/layout.tsx")).toMatch(/<ScrollDirection \/>/);
    const css = read("app/globals.css");
    // Hidden on the way down, but never out of reach of the keyboard, and back at once when focused.
    expect(css).toMatch(/html\[data-scroll="down"\] \.site-header-actions:not\(:focus-within\) \{\s*opacity: 0;\s*translate: 0 -0\.5rem;\s*pointer-events: none;/);
    expect(css).not.toMatch(/\.site-header-actions[^{]*\{[^}]*(visibility: hidden|display: none)/);
  });
});
