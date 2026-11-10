import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GUIDE_SECTIONS } from "./guide";
import { activeTab, navTabs, workerMore } from "./nav";

const app = (p: string) => join(__dirname, "../app", p);
const text = GUIDE_SECTIONS.flatMap((s) => s.points).join("\n");

describe("the worker's guide", () => {
  it("has the four sections the screens link to, each pointing at a real page", () => {
    expect(GUIDE_SECTIONS.map((s) => s.id)).toEqual(["jobs", "shifts", "pay", "privacy"]);
    for (const s of GUIDE_SECTIONS) expect(existsSync(app(`${s.link!.href.slice(1)}/page.tsx`))).toBe(true);
  });

  it("keeps the statements about pay and privacy that the screens no longer spell out", () => {
    expect(text).toContain("Turfcut never takes a cut of your pay. Campaigns pay the platform fee.");
    expect(text).toContain("Stripe collects your bank and tax details; Turfcut never sees them.");
    expect(text).toContain("Once pay is approved for payment, its amount never changes.");
    expect(text).toContain("Neither is ever used to rank jobs or people.");
    expect(text).toContain("Turfcut never guesses your politics.");
    // Hourly only: shift-rate and per-unit jobs are not paid by the clock.
    expect(text).toContain("On hourly jobs, pay counts verified time only.");
  });

  it("is reachable: a card on Home, a link from Earnings, a row in the menu and sidebar", () => {
    expect(readFileSync(app("dashboard/page.tsx"), "utf8")).toContain('href="/guide"');
    expect(readFileSync(app("earnings/page.tsx"), "utf8")).toContain('href="/guide#pay"');
    expect(activeTab([...navTabs("WORKER", false), ...workerMore("WORKER")], "/guide")).toBe("/guide");
  });

  it("the screens keep their one short line where money or privacy is at stake", () => {
    const earnings = readFileSync(app("earnings/page.tsx"), "utf8");
    expect(earnings).toContain("Turfcut takes no cut.");
    expect(earnings).toContain("Turfcut never sees them.");
    expect(readFileSync(app("jobs/page.tsx"), "utf8")).toContain("private and never used for ranking");
    expect(readFileSync(app("dashboard/page.tsx"), "utf8")).toContain("Your answers stay private.");
  });
});
