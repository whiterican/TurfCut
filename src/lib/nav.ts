import type { Role, SessionProfile } from "@/lib/auth";
import { accessFor, ROLE_LABELS, type Area, type Grants } from "@/lib/access";

/** The glyph a tab shows (drawn in components/AppNav; a plain id here keeps React out of lib). */
export type TabIconId =
  | "home"
  | "today"
  | "feed"
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
  | "credentials"
  | "settings"
  | "campaigns"
  | "admin"
  | "more";

export interface NavTab {
  href: string;
  label: string;
  icon: TabIconId;
  /** Other paths this tab owns (the worker's Jobs tab holds the schedule too). */
  also?: string[];
}

export const MESSAGES_HREF = "/messages";

type OrgItem = NavTab & { area: Area; id: OrgNavId };
type OrgNavId = "desk" | "hiring" | "jobs" | "field" | "messages" | "pay" | "credentials" | "campaigns" | "members" | "settings";

/** Every organization area, in rail order, tied to the access-map area its route checks. */
export const ORG_TABS: OrgItem[] = [
  { id: "desk", href: "/desk", label: "Desk", icon: "desk", area: "desk" },
  { id: "hiring", href: "/hiring", label: "Hiring", icon: "hiring", area: "hiring" },
  { id: "jobs", href: "/jobs", label: "Jobs", icon: "jobs", area: "jobs" },
  { id: "field", href: "/field", label: "Field", icon: "field", area: "field" },
  { id: "messages", href: MESSAGES_HREF, label: "Messages", icon: "messages", area: "messages" },
  { id: "pay", href: "/pay", label: "Pay", icon: "pay", area: "pay" },
  { id: "credentials", href: "/org/credentials", label: "Credentials", icon: "credentials", area: "compliance" },
  { id: "campaigns", href: "/campaigns", label: "Campaigns", icon: "campaigns", area: "campaignPosting" },
  { id: "members", href: "/org/settings/members", label: "Members", icon: "members", area: "orgMembers" },
  { id: "settings", href: "/org/settings", label: "Settings", icon: "settings", area: "orgSettings" },
];

/**
 * The phone bar's tabs per role, in order (C1 plan). Anything else the role
 * can reach goes under More. A pick the role can't reach is skipped and the
 * bar fills from the rail order.
 */
export const PHONE_PICKS: Record<Exclude<Role, "WORKER">, OrgNavId[]> = {
  OWNER: ["desk", "hiring", "field", "messages"],
  RECRUITER: ["desk", "hiring", "jobs", "messages"],
  SUPERVISOR: ["desk", "field", "jobs", "messages"],
  FINANCE: ["desk", "pay", "jobs"],
  PUBLISHER: ["desk", "campaigns", "jobs"],
  COMPLIANCE: ["desk", "credentials", "jobs"],
  // A custom role's bar is whatever of these it reaches, filled from the rail order (M10.6).
  CUSTOM: ["desk", "hiring", "jobs", "field"],
};

/**
 * The worker's five tabs, one unified dock on every worker screen (hero
 * board, founder 2026-10-28): Today holds the campaign feed, Jobs holds
 * finding work and the worker's own schedule. The desktop top bar shows the
 * same five.
 */
const WORKER_TABS: NavTab[] = [
  { href: "/dashboard", label: "Today", icon: "home", also: ["/feed"] },
  { href: "/jobs", label: "Jobs", icon: "work", also: ["/shifts"] },
  { href: MESSAGES_HREF, label: "Messages", icon: "messages" },
  { href: "/earnings", label: "Earnings", icon: "pay" },
  { href: "/profile", label: "Profile", icon: "profile" },
];

const plain = ({ href, label, icon }: NavTab): NavTab => ({ href, label, icon });

/**
 * Tabs per role (workers: Today / Jobs / Messages / Earnings / Profile).
 * Organization roles get every area the access map grants them, so a tab
 * never appears for a route that would refuse you. A removed member (no
 * organization) gets none.
 */
export function navTabs(role: Role | null, hasOrg: boolean, grants: Grants | null = null): NavTab[] {
  if (role === "WORKER") return WORKER_TABS;
  if (!role || !hasOrg) return [];
  return ORG_TABS.filter((t) => accessFor({ role, grants }, t.area) !== null).map(plain);
}

/** The desktop top bar's tabs: the worker's dock tabs; nobody else has a top bar (organizations use the rail). */
export function topNavTabs(role: Role | null): NavTab[] {
  return role === "WORKER" ? WORKER_TABS : [];
}

export interface OrgNav {
  /** Desktop left rail: every area the role reaches. */
  rail: NavTab[];
  /** Phone bar: the role's picks. */
  phone: NavTab[];
  /** Phone "More" sheet: the rest. Empty means no More tab. */
  more: NavTab[];
}

/** The admin console (M10): a place Turfcut staff go, never a tab of the role's own work. */
const ADMIN_TAB: NavTab = { href: "/admin", label: "Admin", icon: "admin" };

/**
 * The organization shell's navigation for a role (empty for workers and
 * removed members). Staff get Admin at the end of the rail and in More,
 * never in the phone bar's picks: those stay the role's work. (Staff who
 * are workers reach the console from Settings; the worker bar has no More.)
 */
export function orgNav(role: Role | null, hasOrg: boolean, staff = false, grants: Grants | null = null): OrgNav {
  if (!role || role === "WORKER" || !hasOrg) return { rail: [], phone: [], more: [] };
  const reach = ORG_TABS.filter((t) => accessFor({ role, grants }, t.area) !== null);
  const picks = PHONE_PICKS[role];
  const phone = picks.map((id) => reach.find((t) => t.id === id)).filter((t): t is OrgItem => !!t);
  for (const t of reach) if (phone.length < picks.length && !phone.includes(t)) phone.push(t);
  const extra = staff ? [ADMIN_TAB] : [];
  return { rail: [...reach.map(plain), ...extra], phone: phone.map(plain), more: [...reach.filter((t) => !phone.includes(t)).map(plain), ...extra] };
}

/**
 * Where an organization member lands after signing in: the Desk when their
 * role has one, else the first page their role reaches, else Settings. A
 * page a member can't use sends them to /dashboard, which sends them here,
 * so every tab's guard has to admit exactly the grants that show its tab
 * (the test walks every grant against the pages' guards).
 */
export function landingFor(role: Role, grants: Grants | null, staff = false): string {
  if (accessFor({ role, grants }, "desk") === "full") return "/desk";
  return orgNav(role, true, staff, grants).rail[0]?.href ?? "/settings";
}

/** The tab a path belongs to: the longest matching prefix wins. */
export function activeTab(tabs: NavTab[], pathname: string): string | null {
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  // Each tab's longest matching path, its own or one it also owns.
  const hits = tabs.flatMap((t) => [t.href, ...(t.also ?? [])].filter(under).map((p) => ({ href: t.href, len: p.length })));
  return hits.sort((a, b) => b.len - a.len)[0]?.href ?? null;
}

/** Who the rail says is signed in: their own name (else their email), and their role as the organization names it. */
export function railPerson(s: Pick<SessionProfile, "displayName" | "email" | "role" | "roleName">): { name: string; role: string } {
  return { name: s.displayName?.trim() || s.email || "Your account", role: s.roleName ?? ROLE_LABELS[s.role] };
}
