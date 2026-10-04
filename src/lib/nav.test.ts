import { describe, expect, it } from "vitest";
import { activeTab, navTabs, ORG_TABS } from "./nav";
import { accessTo, ORG_ROLES } from "./access";

describe("navigation", () => {
  it("gives each role its own tabs", () => {
    expect(navTabs("WORKER", false).map((t) => t.label)).toEqual(["Today", "Work", "Shifts", "Messages", "Profile"]);
    // C1: no People directory; organizations reach workers through a job.
    expect(navTabs("OWNER", true).map((t) => t.label)).toEqual(["Ops", "Jobs", "Messages", "Pay", "Settings"]);
    expect(navTabs("RECRUITER", true).map((t) => t.label)).toEqual(["Ops", "Jobs", "Messages", "Settings"]);
    expect(navTabs("PUBLISHER", true).map((t) => t.label)).toEqual(["Ops", "Jobs", "Settings"]);
    expect(navTabs("FINANCE", true).map((t) => t.label)).toEqual(["Ops", "Jobs", "Pay", "Settings"]);
    expect(navTabs("SUPERVISOR", true).map((t) => t.label)).toEqual(["Ops", "Jobs", "Messages", "Settings"]);
    // Chat is for team staff.
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

  it("never shows an organization tab for a route the role can't reach", () => {
    for (const role of ORG_ROLES) {
      for (const tab of navTabs(role, true)) {
        const area = ORG_TABS.find((t) => t.href === tab.href)!.area;
        expect({ role, tab: tab.href, access: accessTo(role, area) !== null }).toEqual({ role, tab: tab.href, access: true });
      }
    }
  });
});
