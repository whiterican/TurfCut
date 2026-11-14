import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HOW_IT_WORKS, LANDING_LINE, LANDING_PHOTO, LANDING_PROOF } from "@/lib/landing-copy";

const art = readFileSync(join(__dirname, "HeroArt.tsx"), "utf8");
const landing = readFileSync(join(__dirname, "../../app/page.tsx"), "utf8");
const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");

describe("the sign-in pages' side panel", () => {
  it("is the landing page beside the form: the same photograph, line and three steps, from one source", () => {
    // Caden, Nov 14: the panel was a large empty dark space; it should be the page a visitor saw before this one.
    for (const name of ["LANDING_PHOTO", "LANDING_LINE", "LANDING_PROOF", "HOW_IT_WORKS"]) {
      expect(art, name).toContain(name);
      expect(landing, name).toContain(name);
    }
    expect(landing).not.toContain('"Field work that matters."');
    expect(HOW_IT_WORKS).toHaveLength(3);
    expect(LANDING_LINE).toBe("Field work that matters.");
    expect(LANDING_PROOF.length).toBeGreaterThan(20);
    expect(LANDING_PHOTO).toMatch(/^\/photos\/.+\.jpg$/);
    // Rule 5: the words promise a work record with no universal worker score.
    expect(HOW_IT_WORKS[2].description).toMatch(/without a universal worker score/);
  });

  it("is decorative, and its photograph is not fetched where the panel is not drawn", () => {
    expect(art).toMatch(/<div className="hero-split-art" aria-hidden>/);
    expect(art).toMatch(/<Image src=\{LANDING_PHOTO\} alt="" fill sizes="\(min-width: 64rem\) 45vw, 1px"/);
    expect(art).not.toMatch(/priority/);
  });

  it("shows only the line below 1024, and from 1024 stays in the window while a long form scrolls", () => {
    expect(css).toMatch(/\n  \.hero-split-photo,\s*\.hero-split-scrim,\s*\.hero-split-proof,\s*\.hero-split-steps \{\s*display: none;/);
    const wide = css.slice(css.indexOf("    .hero-split-art {\n      @apply relative isolate"));
    expect(wide).toMatch(/^[^}]*position: sticky;\s*top: var\(--site-header-h\);\s*height: calc\(100svh - var\(--site-header-h\)\);\s*align-self: start;/);
    for (const part of ["photo", "scrim", "proof", "steps"]) expect(wide, part).toMatch(new RegExp(`\\.hero-split-${part} \\{[^}]*display: block;`));
    // The shade is a radial, as the landing page's is: the motion rules allow one linear easing word and no other "linear".
    expect(wide.slice(0, wide.indexOf(".hero-split-mark {"))).toMatch(/background: radial-gradient\(/);
  });
});
