import type { Role } from "@/lib/auth";
import { CHAT_STAFF_ROLES } from "@/lib/chat";
import { PAY_ROLES } from "@/lib/access";

/** The glyph a tab shows (drawn in components/AppNav; a plain id here keeps React out of lib). */
export type TabIconId = "today" | "work" | "shifts" | "messages" | "profile" | "ops" | "jobs" | "people" | "pay" | "settings";

export interface NavTab {
  href: string;
  label: string;
  icon: TabIconId;
}

export const MESSAGES_HREF = "/messages";

/**
 * Tabs per role (screen mockups: Today / Work / Shifts / Profile for workers;
 * Ops / Jobs / People for organizers), plus Messages for everyone who chats
 * and Pay for owners and finance.
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
  const hiring = role === "OWNER" || role === "RECRUITER";
  return [
    { href: "/dashboard", label: "Ops", icon: "ops" },
    { href: "/jobs", label: "Jobs", icon: "jobs" },
    ...(hiring ? [{ href: "/workers", label: "People", icon: "people" as const }] : []),
    ...(CHAT_STAFF_ROLES.includes(role) ? [{ href: MESSAGES_HREF, label: "Messages", icon: "messages" as const }] : []),
    ...(PAY_ROLES.includes(role) ? [{ href: "/payouts", label: "Pay", icon: "pay" as const }] : []),
    { href: "/org/settings", label: "Settings", icon: "settings" },
  ];
}

/** The tab a path belongs to: the longest matching prefix wins. */
export function activeTab(tabs: NavTab[], pathname: string): string | null {
  const hits = tabs.filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  return hits.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}
