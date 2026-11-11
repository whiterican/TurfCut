import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GUIDE_SECTIONS, guideFor, ORG_GUIDE_SECTIONS } from "./guide";
import { PETITION_NOTICE } from "./chat";
import { activeTab, navTabs, workerMore } from "./nav";
import { ORG_ROLES } from "./access";

const app = (p: string) => join(__dirname, "../app", p);
const text = GUIDE_SECTIONS.flatMap((s) => s.points).join("\n");

describe("the worker's guide", () => {
  it("has the sections the screens link to, each pointing at a real page", () => {
    expect(GUIDE_SECTIONS.map((s) => s.id)).toEqual(["jobs", "shifts", "messages", "pay", "privacy"]);
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

  it("carries the petition-sheet rule for both sides, since the message box only shows it when a file is about to be sent", () => {
    // Caden, Nov 11: the rule sat in bold under every message box. It is here, beside a file being attached, and in the refusal of a photo.
    for (const sections of [GUIDE_SECTIONS, ORG_GUIDE_SECTIONS]) expect(sections.find((s) => s.id === "messages")!.points).toContain(PETITION_NOTICE);
    const thread = readFileSync(join(__dirname, "../components/chat/Thread.tsx"), "utf8");
    expect(thread).toMatch(/\{file && \(\s*<p [^>]*role="note">\s*\{PETITION_NOTICE\}/);
    expect(thread).toContain("Photos can't be shared in Turfcut chats. ${PETITION_NOTICE}");
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

describe("the organization's guide", () => {
  const org = ORG_GUIDE_SECTIONS.flatMap((s) => s.points).join("\n");

  it("is what every organization role gets, and each section points at a real page", () => {
    for (const role of ORG_ROLES) expect(guideFor(role)).toBe(ORG_GUIDE_SECTIONS);
    expect(guideFor("WORKER")).toBe(GUIDE_SECTIONS);
    expect(ORG_GUIDE_SECTIONS.map((s) => s.id)).toEqual(["publishing", "field", "messages", "pay", "credentials", "team"]);
    for (const s of ORG_GUIDE_SECTIONS) expect(existsSync(app(`${s.link!.href.slice(1)}/page.tsx`))).toBe(true);
  });

  it("keeps the statements the screens rely on it for", () => {
    expect(org).toContain("Nobody's position is ever on the map.");
    expect(org).toContain("Workers receive the full gross amount. The 15% platform fee is invoiced to your organization.");
    expect(org).toContain("Turfcut never shows you a credential's number.");
    expect(org).toContain("The worker sees each time your organization opens that photo.");
    expect(org).toContain("A photo is something to check, not proof by itself.");
    expect(org).toContain("A job publishes only under an approved, current, unexpired jurisdiction rule profile.");
  });

  it("says nothing about ranking or scoring workers, and never mentions politics", () => {
    expect(org).not.toMatch(/rank|score|politic|ideolog/i);
  });

  it("the credentials screen keeps its short line and links here; Settings links to the guide for every role", () => {
    const page = readFileSync(app("org/credentials/page.tsx"), "utf8");
    expect(page).toContain("Turfcut itself never shows you a credential&apos;s number");
    expect(page).toContain("Open it first to record that you checked it that way.");
    expect(page).toContain("not proof by itself");
    expect(page).toContain("the worker sees each time you open it");
    expect(page).toContain('href="/guide#credentials"');
    expect(readFileSync(app("settings/page.tsx"), "utf8")).toContain('href="/guide"');
  });
});

