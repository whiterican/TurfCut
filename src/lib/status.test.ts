import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STATUS_LOOK, STATUS_STATES, syncStatus } from "@/lib/status";
import type { PillState } from "@/lib/moments";

const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

describe("status vocabulary", () => {
  it("no two states share a glyph and a colour family", () => {
    const pairs = STATUS_STATES.map((s) => `${STATUS_LOOK[s].glyph}/${STATUS_LOOK[s].tone}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    const glyphs = STATUS_STATES.map((s) => STATUS_LOOK[s].glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
  it("every state has its chip rule in the stylesheet", () => {
    for (const s of STATUS_STATES) expect(css).toMatch(new RegExp(`\\.status-${s}[,\\s{]`));
  });
  it("only live is forest", () => {
    expect(STATUS_STATES.filter((s) => STATUS_LOOK[s].tone === "forest")).toEqual(["live"]);
  });
  it("sync: memory-only and refused are never said as sent", () => {
    const all: PillState[] = ["online", "offline", "syncing", "waiting", "refused", "unsaved"];
    const states = Object.fromEntries(all.map((p) => [p, syncStatus(p, "x").state]));
    expect(states).toEqual({ online: "closed", offline: "queued", syncing: "sending", waiting: "queued", refused: "blocked", unsaved: "memory-only" });
  });
});
