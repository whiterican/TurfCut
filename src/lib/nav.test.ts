import { describe, expect, it } from "vitest";
import { activeTab, navTabs, ORG_TABS, orgNav } from "./nav";
import { accessTo, ORG_ROLES } from "./access";

describe("navigation", () => {
  it("gives each role its own tabs", () => {
    expect(navTabs("WORKER", false).map((t) => t.label)).toEqual(["Today", "Feed", "Work", "Shifts", "Messages", "Profile"]);
    // C1: no People directory; organizations reach workers through a job.
    expect(navTabs("OWNER", true).map((t) => t.label)).toEqual(["Desk", "Hiring", "Jobs", "Field", "Messages", "Pay", "Credentials", "Campaigns", "Members", "Settings"]);
    // Recruiters read the field (no actions there).
    expect(navTabs("RECRUITER", true).map((t) => t.label)).toEqual(["Desk", "Hiring", "Jobs", "Field", "Messages", "Campaigns", "Settings"]);
    expect(navTabs("PUBLISHER", true).map((t) => t.label)).toEqual(["Desk", "Jobs", "Campaigns", "Settings"]);
    expect(navTabs("FINANCE", true).map((t) => t.label)).toEqual(["Desk", "Jobs", "Pay", "Settings"]);
    expect(navTabs("SUPERVISOR", true).map((t) => t.label)).toEqual(["Desk", "Jobs", "Field", "Messages", "Settings"]);
    // Chat is for team staff.
    expect(navTabs("COMPLIANCE", true).map((t) => t.label)).toEqual(["Desk", "Jobs", "Credentials", "Settings"]);
    expect(navTabs("RECRUITER", false)).toEqual([]);
    expect(navTabs(null, false)).toEqual([]);
  });

  it("gives staff the admin console at the end of the rail and in More, never in the phone bar (M10)", () => {
    const owner = orgNav("OWNER", true, true);
    expect(owner.rail.at(-1)).toEqual({ href: "/admin", label: "Admin", icon: "admin" });
    expect(owner.more.at(-1)?.href).toBe("/admin");
    expect(owner.phone.some((t) => t.href === "/admin")).toBe(false);
    // Not staff: no trace of it, whatever the role.
    for (const role of ORG_ROLES) {
      const nav = orgNav(role, true);
      expect([...nav.rail, ...nav.phone, ...nav.more].some((t) => t.href === "/admin")).toBe(false);
    }
    // A staff worker keeps the worker bar (six tabs, no More): the console is reached from Settings.
    expect(navTabs("WORKER", false).map((t) => t.label)).toEqual(["Today", "Feed", "Work", "Shifts", "Messages", "Profile"]);
    expect(orgNav("WORKER", false, true)).toEqual({ rail: [], phone: [], more: [] });
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

  it("splits the organization shell into rail, phone bar and More", () => {
    const labels = (r: Parameters<typeof orgNav>[0]) => {
      const n = orgNav(r, true);
      return { rail: n.rail.map((t) => t.label), phone: n.phone.map((t) => t.label), more: n.more.map((t) => t.label) };
    };
    // The plan's phone bars.
    expect(labels("OWNER")).toEqual({ rail: ["Desk", "Hiring", "Jobs", "Field", "Messages", "Pay", "Credentials", "Campaigns", "Members", "Settings"], phone: ["Desk", "Hiring", "Field", "Messages"], more: ["Jobs", "Pay", "Credentials", "Campaigns", "Members", "Settings"] });
    expect(labels("RECRUITER")).toEqual({ rail: ["Desk", "Hiring", "Jobs", "Field", "Messages", "Campaigns", "Settings"], phone: ["Desk", "Hiring", "Jobs", "Messages"], more: ["Field", "Campaigns", "Settings"] });
    expect(labels("SUPERVISOR")).toEqual({ rail: ["Desk", "Jobs", "Field", "Messages", "Settings"], phone: ["Desk", "Field", "Jobs", "Messages"], more: ["Settings"] });
    expect(labels("FINANCE")).toEqual({ rail: ["Desk", "Jobs", "Pay", "Settings"], phone: ["Desk", "Pay", "Jobs"], more: ["Settings"] });
    expect(labels("COMPLIANCE")).toEqual({ rail: ["Desk", "Jobs", "Credentials", "Settings"], phone: ["Desk", "Credentials", "Jobs"], more: ["Settings"] });
    expect(labels("PUBLISHER")).toEqual({ rail: ["Desk", "Jobs", "Campaigns", "Settings"], phone: ["Desk", "Campaigns", "Jobs"], more: ["Settings"] });
    expect(orgNav("WORKER", false)).toEqual({ rail: [], phone: [], more: [] });
    expect(orgNav("OWNER", false)).toEqual({ rail: [], phone: [], more: [] });
  });

  it("puts every area a role reaches in exactly one of phone bar or More", () => {
    for (const role of ORG_ROLES) {
      const n = orgNav(role, true);
      expect([...n.phone, ...n.more].map((t) => t.href).sort()).toEqual(n.rail.map((t) => t.href).sort());
      expect(n.phone.length).toBeLessThanOrEqual(4);
    }
  });
});
