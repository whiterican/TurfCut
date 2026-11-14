import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "SnapshotView.tsx"), "utf8");
const row = readFileSync(join(__dirname, "Row.tsx"), "utf8");

describe("a hiring snapshot's list", () => {
  it("keeps each term and its value one <div> under the <dl>", () => {
    // HTML allows one <div> between a <dl> and its <dt>/<dd>. Row is that one; a second wrapper (even
    // display: contents) makes the terms orphans to a screen reader (axe: definition-list, dlitem).
    expect(row).toMatch(/<div className="[^"]*">\s*<dt /);
    const list = src.slice(src.indexOf('<dl className="list-card">'), src.indexOf("</dl>"));
    expect(list).not.toMatch(/<div\b/);
    expect(list).toContain("<Fragment key={seg.workType}>");
  });
});
