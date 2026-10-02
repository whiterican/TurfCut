import { describe, expect, it } from "vitest";
import { activeTab, navTabs } from "./nav";

describe("navigation", () => {
  it("gives each role its own tabs", () => {
    expect(navTabs("WORKER", false).map((t) => t.label)).toEqual(["Today", "Work", "Shifts", "Messages", "Profile"]);
    expect(navTabs("OWNER", true).map((t) => t.label)).toEqual(["Ops", "Jobs", "People", "Messages", "Pay", "Settings"]);
    expect(navTabs("FINANCE", true).map((t) => t.label)).toEqual(["Ops", "Jobs", "Pay", "Settings"]);
    expect(navTabs("SUPERVISOR", true).map((t) => t.label)).toEqual(["Ops", "Jobs", "Messages", "Settings"]);
    // Worker profiles are for owners and recruiters only; chat is for team staff.
    expect(navTabs("COMPLIANCE", true).map((t) => t.label)).toEqual(["Ops", "Jobs", "Settings"]);
    expect(navTabs("RECRUITER", false)).toEqual([]);
    expect(navTabs(null, false)).toEqual([]);
  });

  it("highlights the tab a page belongs to", () => {
    const tabs = navTabs("WORKER", false);
    expect(activeTab(tabs, "/profile/preferences")).toBe("/profile");
    expect(activeTab(tabs, "/jobs/abc")).toBe("/jobs");
    expect(activeTab(tabs, "/jobsearch")).toBeNull();
    expect(activeTab(tabs, "/login")).toBeNull();
  });
});
