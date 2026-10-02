import type { Role } from "@/lib/auth";
import { CHAT_STAFF_ROLES } from "@/lib/chat";
import { PAY_ROLES } from "@/lib/access";

export interface NavTab {
  href: string;
  label: string;
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
      { href: "/dashboard", label: "Today" },
      { href: "/jobs", label: "Work" },
      { href: "/shifts", label: "Shifts" },
      { href: MESSAGES_HREF, label: "Messages" },
      { href: "/profile", label: "Profile" },
    ];
  }
  if (!role || !hasOrg) return [];
  const hiring = role === "OWNER" || role === "RECRUITER";
  return [
    { href: "/dashboard", label: "Ops" },
    { href: "/jobs", label: "Jobs" },
    ...(hiring ? [{ href: "/workers", label: "People" }] : []),
    ...(CHAT_STAFF_ROLES.includes(role) ? [{ href: MESSAGES_HREF, label: "Messages" }] : []),
    ...(PAY_ROLES.includes(role) ? [{ href: "/payouts", label: "Pay" }] : []),
    { href: "/org/settings", label: "Settings" },
  ];
}

/** The tab a path belongs to: the longest matching prefix wins. */
export function activeTab(tabs: NavTab[], pathname: string): string | null {
  const hits = tabs.filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  return hits.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}
