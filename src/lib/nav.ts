import type { Role } from "@/lib/auth";
import { accessTo, type Area } from "@/lib/access";

/** The glyph a tab shows (drawn in components/AppNav; a plain id here keeps React out of lib). */
export type TabIconId = "today" | "work" | "shifts" | "messages" | "profile" | "ops" | "jobs" | "people" | "pay" | "settings";

export interface NavTab {
  href: string;
  label: string;
  icon: TabIconId;
}

export const MESSAGES_HREF = "/messages";

/** Organization tabs, each tied to the access-map area its route checks. */
export const ORG_TABS: Array<NavTab & { area: Area }> = [
  { href: "/dashboard", label: "Ops", icon: "ops", area: "desk" },
  { href: "/jobs", label: "Jobs", icon: "jobs", area: "jobs" },
  { href: MESSAGES_HREF, label: "Messages", icon: "messages", area: "messages" },
  { href: "/payouts", label: "Pay", icon: "pay", area: "pay" },
  { href: "/org/settings", label: "Settings", icon: "settings", area: "orgSettings" },
];

/**
 * Tabs per role (screen mockups: Today / Work / Shifts / Profile for workers).
 * Organization roles get the tabs whose area the access map grants them, so
 * a tab never appears for a route that would refuse you.
 */
export function navTabs(role: Role | null, hasOrg: boolean): NavTab[] {
  if (role === "WORKER") {
    return [
      { href: "/dashboard", label: "Today", icon: "today" },
      { href: "/jobs", label: "Work", icon: "work" },
      { href: "/shifts", label: "Shifts", icon: "shifts" },
      { href: MESSAGES_HREF, label: "Messages", icon: "messages" },
      { href: "/profile", label: "Profile", icon: "profile" },
    ];
  }
  if (!role || !hasOrg) return [];
  return ORG_TABS.filter((t) => accessTo(role, t.area) !== null).map(({ href, label, icon }) => ({ href, label, icon }));
}
/** The tab a path belongs to: the longest matching prefix wins. */
export function activeTab(tabs: NavTab[], pathname: string): string | null {
  const hits = tabs.filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  return hits.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}
