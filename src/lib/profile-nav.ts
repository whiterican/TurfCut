/** The worker's profile sections, in order (redesign §5). */
export const PROFILE_SECTIONS = [
  { href: "/profile", label: "Profile" },
  { href: "/earnings", label: "Earnings" },
  { href: "/profile/availability", label: "Availability" },
  { href: "/profile/credentials", label: "Credentials" },
  { href: "/profile/sharing", label: "Who sees what" },
  { href: "/profile/preferences", label: "Political preferences" },
  { href: "/profile/preview", label: "What organizations see" },
  { href: "/settings", label: "Settings & sign out" },
] as const;

/**
 * A section's aria-current for a path: "page" on its own page, "true" on a
 * page below it (the section the page belongs to), else nothing. /profile
 * itself owns only its own page: its sub-sections are listed beside it.
 * Reads from the app's root whatever the path is mounted under.
 */
export function profileSectionCurrent(href: string, pathname: string): "page" | "true" | undefined {
  const at = pathname.search(/\/(profile|earnings|settings)(\/|$)/);
  const path = at < 0 ? pathname : pathname.slice(at);
  if (path === href) return "page";
  if (href === "/profile") return undefined;
  const owner = PROFILE_SECTIONS.filter((s) => s.href !== "/profile" && path.startsWith(`${s.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
  return owner?.href === href ? "true" : undefined;
}
