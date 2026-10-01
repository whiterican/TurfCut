import type { Role } from "@/lib/auth";

export interface NavTab {
  href: string;
  label: string;
}

/**
 * Tabs per role (screen mockups: Today / Work / Shifts / Profile for workers;
 * Ops / Jobs / People for organizers). Chat joins when it ships.
 */
export function navTabs(role: Role | null, hasOrg: boolean): NavTab[] {
  if (role === "WORKER") {
    return [
      { href: "/dashboard", label: "Today" },
      { href: "/jobs", label: "Work" },
      { href: "/shifts", label: "Shifts" },
      { href: "/profile", label: "Profile" },
    ];
  }
  if (!role || !hasOrg) return [];
  const hiring = role === "OWNER" || role === "RECRUITER";
  return [
    { href: "/dashboard", label: "Ops" },
    { href: "/jobs", label: "Jobs" },
    ...(hiring ? [{ href: "/workers", label: "People" }] : []),
    { href: "/org/settings", label: "Settings" },
  ];
}

/** The tab a path belongs to: the longest matching prefix wins. */
export function activeTab(tabs: NavTab[], pathname: string): string | null {
  const hits = tabs.filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  return hits.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}
