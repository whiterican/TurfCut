import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NO_TILT, TILT_MAX_DEG, TILT_MIN_DEG, TILT_TARGETS, tiltFor } from "./press-tilt";

const tile = { left: 100, top: 200, width: 150, height: 120 };

describe("a pressed card dips toward the finger", () => {
  it("does not turn when pressed in the middle", () => {
    expect(tiltFor(tile, 175, 260)).toMatchObject({ rx: 0, ry: 0 });
  });

  it("weighs down the side that is pressed", () => {
    // rotateY(+) sends the right edge away from the viewer; rotateX(+) sends the top edge away.
    expect(tiltFor(tile, 250, 260)).toMatchObject({ rx: 0, ry: TILT_MAX_DEG });
    expect(tiltFor(tile, 100, 260)).toMatchObject({ rx: 0, ry: -TILT_MAX_DEG });
    expect(tiltFor(tile, 175, 200)).toMatchObject({ rx: TILT_MAX_DEG, ry: 0 });
    expect(tiltFor(tile, 175, 320)).toMatchObject({ rx: -TILT_MAX_DEG, ry: 0 });
    // A corner dips on both axes; halfway to an edge dips half as far.
    expect(tiltFor(tile, 250, 320)).toMatchObject({ rx: -TILT_MAX_DEG, ry: TILT_MAX_DEG });
    expect(tiltFor(tile, 212.5, 260)).toMatchObject({ rx: 0, ry: TILT_MAX_DEG / 2 });
  });

  it("says where across the card the press is, for the light that pools there", () => {
    expect(tiltFor(tile, 250, 200)).toMatchObject({ lx: 1, ly: -1 });
    expect(tiltFor(tile, 175, 260)).toMatchObject({ lx: 0, ly: 0 });
    expect(tiltFor(tile, 137.5, 290)).toMatchObject({ lx: -0.5, ly: 0.5 });
  });

  it("turns a big card less than a small tile, and never less than a visible amount", () => {
    const card = { left: 16, top: 0, width: 360, height: 300 };
    expect(tiltFor(card, 376, 150).ry).toBe(1.25);
    const page = { left: 0, top: 0, width: 700, height: 2400 };
    expect(tiltFor(page, 700, 1200).ry).toBe(TILT_MIN_DEG);
    expect(tiltFor({ left: 0, top: 0, width: 40, height: 40 }, 40, 20).ry).toBe(TILT_MAX_DEG);
  });

  it("treats a finger that slid off the card as its edge, and survives a box with no size", () => {
    expect(tiltFor(tile, 900, -50)).toMatchObject({ rx: TILT_MAX_DEG, ry: TILT_MAX_DEG });
    expect(tiltFor({ left: 0, top: 0, width: 0, height: 0 }, 10, 10)).toMatchObject({ rx: 0, ry: 0 });
  });

  it("covers the boxes that float, and leaves alone what moves or scrolls by itself", () => {
    const targets = TILT_TARGETS.split(", ");
    for (const t of [".card", ".hero-card", ".stat-tile", ".work-card", ".shift-card", ".empty-state"]) expect(targets).toContain(t);
    for (const t of [".swipe-card", ".data-table-wrap", ".choice-list", ".card-flat", ".kv"]) expect(targets).not.toContain(t);
    // A swiped job card holds a job row, which is a target: the press is stopped by the wrapper, with maps and pickers.
    for (const t of [".swipe-card", ".turf-map", ".leaflet-container", "select", "input[type='range']"]) expect(NO_TILT.split(", ")).toContain(t);
  });
});

describe("the dip in the stylesheet and the page", () => {
  const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
  const part = readFileSync(join(__dirname, "../components/PressTilt.tsx"), "utf8");

  it("turns the pressed card by the angles the script sets, and only where motion is allowed", () => {
    const at = css.indexOf('html:not([data-motion="reduce"]) [data-tilt="on"] {');
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(css.lastIndexOf("@media", at), at)).toMatch(/^@media \(prefers-reduced-motion: no-preference\) \{/);
    expect(css).toMatch(/\[data-tilt="on"\] \{\s*transform: perspective\(900px\) rotateX\(var\(--tilt-x, 0deg\)\) rotateY\(var\(--tilt-y, 0deg\)\) scale\(0\.994\);/);
    // Only transform moves: the card's neighbours never shift.
    expect(css.slice(at, css.indexOf("}", at))).not.toMatch(/margin|width|height|top:|left:/);
  });

  it("pressed glass: light pools under the finger and the shadow pulls in; rings drawn with the same property are left alone", () => {
    expect(css).toMatch(/\[data-tilt="on"\]:not\(\.hero-card, \.option-card\) \{\s*box-shadow:\s*inset calc\(var\(--tilt-lx, 0\) \* -10px\) calc\(var\(--tilt-ly, 0\) \* -10px\) 28px -14px var\(--card-glow\),\s*var\(--card-edge\),\s*var\(--shadow-pressed\);/);
    for (const v of ["--tilt-lx", "--tilt-ly"]) expect(part).toContain(`"${v}"`);
  });

  it("does nothing when motion is reduced, never stops the tap, and is mounted once for the app", () => {
    expect(part).toMatch(/motionReduced\(\)\) return;/);
    expect(part).not.toMatch(/preventDefault|stopPropagation/);
    for (const event of ["pointerdown", "pointermove", "pointerup", "pointercancel", "contextmenu", "dragstart"]) expect(part).toContain(`document.addEventListener("${event}"`);
    // The box is measured once, level; a press that starts on a map, a swiped card or a picker is left alone; a released mouse ends it.
    expect(part.match(/getBoundingClientRect\(\)/g)).toHaveLength(1);
    expect(part).toMatch(/closest\(NO_TILT\)\) return;/);
    expect(part).toMatch(/e\.buttons === 0\) return level\(\);/);
    expect(part).toMatch(/removeAttribute\("data-tilt"\)/);
    expect(readFileSync(join(__dirname, "../app/layout.tsx"), "utf8")).toContain("<PressTilt />");
  });
});
