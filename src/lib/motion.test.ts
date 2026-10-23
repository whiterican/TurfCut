import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DURATION, MOTION_INIT_FRAGMENT, MOTION_KEY, duration, motionReduced, springCurve } from "@/lib/motion";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

/**
 * The motion foundation (P1.1): one set of tokens in the stylesheet, mirrored
 * in script, and one switch that stops everything. These checks keep a new
 * animation from bringing its own numbers, and keep "Less motion" meaning
 * exactly that.
 */
const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The text of one top-level block, by its opening line. */
function block(opening: string, source = noComments): string {
  const i = source.indexOf(opening);
  if (i < 0) throw new Error(`no block "${opening}"`);
  let depth = 0;
  for (let j = i; j < source.length; j++) {
    if (source[j] === "{") depth++;
    if (source[j] === "}" && --depth === 0) return source.slice(i, j + 1);
  }
  throw new Error(`unclosed block "${opening}"`);
}

describe("motion tokens (P1.1)", () => {
  const tokens = block(":where(html) {");

  it("defines every duration the script side knows, with the same value", () => {
    for (const [name, ms] of Object.entries(DURATION)) expect(tokens).toContain(`--dur-${name}: ${ms}ms;`);
    for (const ease of ["standard", "out", "in", "enter"]) expect(tokens).toMatch(new RegExp(`--ease-${ease}: cubic-bezier\\(`));
  });

  it("carries the one spring curve, the same the script side would make", () => {
    expect(tokens).toContain(`--spring: ${springCurve()};`);
    const points = springCurve().slice("linear(".length, -1).split(", ").map(Number);
    expect(points[0]).toBe(0);
    expect(points.at(-1)).toBe(1);
    expect(Math.max(...points)).toBeGreaterThan(1); // one small overshoot: it lands
    expect(Math.max(...points)).toBeLessThan(1.05);
  });

  it("is the only place a duration or curve is written: every animation and transition in the stylesheet reads a token", () => {
    const outside = noComments.replace(block(":where(html) {"), "").replace(block("@media (prefers-reduced-motion: reduce) {"), "").replace(/:root\[data-motion="reduce"\][^{]*\{[^}]*\}/g, "");
    expect(outside.match(/\b\d+(\.\d+)?m?s\b/gi) ?? []).toEqual([]);
    expect(outside.match(/cubic-bezier\(|steps\(|(?<![-\w])linear(\(|\b)|(?<![-\w])ease(-in-out|-in|-out)?\b|\bstep-(start|end)\b/g) ?? []).toEqual([]);
    // Tailwind's own duration, delay and animation classes carry raw numbers too.
    expect(outside.match(/@apply[^;]*\b(duration|delay|animate|ease)-/g) ?? []).toEqual([]);
  });

  it("keeps components on the tokens too: no Tailwind duration, delay or animation classes, no inline durations", () => {
    const files = readdirSync(join(__dirname, ".."), { recursive: true, encoding: "utf8" })
      .filter((f) => /\.(tsx|ts)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes("zz-preview"))
      .map((f) => join(__dirname, "..", f));
    const offenders: string[] = [];
    for (const file of files) {
      // Comments stripped, so prose may say "ease-in"; a token reference (--ease-out) is not a class.
      const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      if (/(?<![-\w])(duration|delay|animate|ease)-(\d|\[|in\b|out\b|linear\b|none\b|spin\b|pulse\b|bounce\b|ping\b)/.test(text) || /transitionDuration|animationDuration|transitionTimingFunction/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("stops everything under both doors: the phone's setting and the app's", () => {
    const stop = ["animation-duration: 0.01ms !important", "transition-duration: 0.01ms !important", "animation-iteration-count: 1 !important"];
    const media = block("@media (prefers-reduced-motion: reduce) {");
    for (const rule of stop) expect(media).toContain(rule);
    for (const name of Object.keys(DURATION)) expect(media).toContain(`--dur-${name}: 0ms;`);
    const app = noComments.slice(noComments.indexOf(':root[data-motion="reduce"] {'));
    for (const rule of stop) expect(app).toContain(rule);
    for (const name of Object.keys(DURATION)) expect(app).toContain(`--dur-${name}: 0ms;`);
    expect(app).toMatch(/:root\[data-motion="reduce"\]::view-transition-old\(\*\)/);
    // The tab bar doesn't tuck under either door.
    expect(noComments).toMatch(/prefers-reduced-motion: no-preference\) \{\s*html:not\(\[data-motion="reduce"\]\)/);
  });

  it("applies the saved choice before first paint, with the theme", () => {
    expect(THEME_INIT_SCRIPT).toContain(MOTION_INIT_FRAGMENT);
    expect(MOTION_INIT_FRAGMENT).toContain(JSON.stringify(MOTION_KEY));
  });
});

describe("the motion switch in script", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (attr: string | null, media: boolean) => {
    vi.stubGlobal("document", { documentElement: { getAttribute: (k: string) => (k === "data-motion" ? attr : null) } });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: media }) });
  };
  it("reads the app's choice, else the phone's", () => {
    stub(null, false);
    expect(motionReduced()).toBe(false);
    expect(duration("base")).toBe(220);
    stub("reduce", false);
    expect(motionReduced()).toBe(true);
    expect(duration("base")).toBe(0);
    stub(null, true);
    expect(motionReduced()).toBe(true);
  });
  it("is off on the server", () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("window", undefined);
    expect(motionReduced()).toBe(false);
  });
});
