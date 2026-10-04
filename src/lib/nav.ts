import type { Role } from "@/lib/auth";
import { accessTo, type Area } from "@/lib/access";

/** The glyph a tab shows (drawn in components/AppNav; a plain id here keeps React out of lib). */
export type TabIconId =
  | "today"
  | "work"
  | "shifts"
  | "messages"
  | "profile"
  | "desk"
  | "hiring"
  | "jobs"
  | "field"
  | "pay"
  | "members"
  | "settings"
  | "more";

export interface NavTab {
  href: string;
  label: string;
  icon: TabIconId;
}

export const MESSAGES_HREF = "/messages";

type OrgItem = NavTab & { area: Area; id: OrgNavId };
type OrgNavId = "desk" | "hiring" | "jobs" | "field" | "messages" | "pay" | "members" | "settings";

/**
 * Every organization area, in rail order, tied to the access-map area its
 * route checks. Hiring and Field join when their pages land (C1.3/C1.4):
 * a tab never points at a route that doesn't exist yet.
 */
export const ORG_TABS: OrgItem[] = [
  { id: "desk", href: "/desk", label: "Desk", icon: "desk", area: "desk" },
  { id: "jobs", href: "/jobs", label: "Jobs", icon: "jobs", area: "jobs" },
  { id: "messages", href: MESSAGES_HREF, label: "Messages", icon: "messages", area: "messages" },
  { id: "pay", href: "/payouts", label: "Pay", icon: "pay", area: "pay" },
  { id: "members", href: "/org/settings/members", label: "Members", icon: "members", area: "orgMembers" },
  { id: "settings", href: "/org/settings", label: "Settings", icon: "settings", area: "orgSettings" },
];

/**
 * The phone bar's tabs per role, in order (C1 plan). Anything else the role
 * can reach goes under More. Picks whose page doesn't exist yet are skipped
 * and the bar fills from the rail order, so it never looks half-empty.
 */
export const PHONE_PICKS: Record<Exclude<Role, "WORKER">, OrgNavId[]> = {
  OWNER: ["desk", "hiring", "field", "messages"],
  RECRUITER: ["desk", "hiring", "jobs", "messages"],
  SUPERVISOR: ["desk", "field", "jobs", "messages"],
  FINANCE: ["desk", "pay", "jobs"],
  PUBLISHER: ["desk", "jobs"],
  COMPLIANCE: ["desk", "jobs"],
};

const WORKER_TABS: NavTab[] = [
  { href: "/dashboard", label: "Today", icon: "today" },
  { href: "/jobs", label: "Work", icon: "work" },
  { href: "/shifts", label: "Shifts", icon: "shifts" },
  { href: MESSAGES_HREF, label: "Messages", icon: "messages" },
  { href: "/profile", label: "Profile", icon: "profile" },
];

const plain = ({ href, label, icon }: NavTab): NavTab => ({ href, label, icon });

/**
 * Tabs per role (screen mockups: Today / Work / Shifts / Profile for workers).
 * Organization roles get every area the access map grants them, so a tab
 * never appears for a route that would refuse you. A removed member (no
 * organization) gets none.
 */
export function navTabs(role: Role | null, hasOrg: boolean): NavTab[] {
  if (role === "WORKER") return WORKER_TABS;
  if (!role || !hasOrg) return [];
  return ORG_TABS.filter((t) => accessTo(role, t.area) !== null).map(plain);
}

export interface OrgNav {
  /** Desktop left rail: every area the role reaches. */
  rail: NavTab[];
  /** Phone bar: the role's picks. */
  phone: NavTab[];
  /** Phone "More" sheet: the rest. Empty means no More tab. */
  more: NavTab[];
}

/** The organization shell's navigation for a role (empty for workers and removed members). */
export function orgNav(role: Role | null, hasOrg: boolean): OrgNav {
  if (!role || role === "WORKER" || !hasOrg) return { rail: [], phone: [], more: [] };
  const reach = ORG_TABS.filter((t) => accessTo(role, t.area) !== null);
  const picks = PHONE_PICKS[role];
  const phone = picks.map((id) => reach.find((t) => t.id === id)).filter((t): t is OrgItem => !!t);
  for (const t of reach) if (phone.length < picks.length && !phone.includes(t)) phone.push(t);
  return { rail: reach.map(plain), phone: phone.map(plain), more: reach.filter((t) => !phone.includes(t)).map(plain) };
}

/** The tab a path belongs to: the longest matching prefix wins. */
export function activeTab(tabs: NavTab[], pathname: string): string | null {
  const hits = tabs.filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  return hits.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}
