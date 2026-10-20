/**
 * The admin console's sections (M10). Each slice adds its own entry when its
 * page exists; nothing is listed ahead of its page. Kept out of lib/nav.ts
 * because the console is a place staff go, not a tab of the app.
 */
export interface AdminSection {
  href: string;
  label: string;
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/jurisdictions", label: "Jurisdictions" },
];

/** The section a path belongs to: the longest matching prefix wins. */
export function activeAdminSection(pathname: string): string | null {
  const hits = ADMIN_SECTIONS.filter((s) => pathname === s.href || pathname.startsWith(`${s.href}/`));
  return hits.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}
