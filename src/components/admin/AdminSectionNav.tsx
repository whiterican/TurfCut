"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeAdminSection, type AdminSection } from "@/lib/admin-nav";

/** The console's section chips (M10). Hidden while there is only one section. */
export function AdminSectionNav({ sections }: { sections: AdminSection[] }) {
  const current = activeAdminSection(usePathname());
  if (sections.length < 2) return null;
  return (
    <nav aria-label="Admin sections" className="flex flex-wrap gap-2">
      {sections.map((s) => (
        <Link key={s.href} href={s.href} className="chip" aria-current={s.href === current ? "page" : undefined}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

/** The console's page heading: the section the page belongs to, so each section names itself (one h1 per page). */
export function AdminHeading({ sections }: { sections: AdminSection[] }) {
  const current = activeAdminSection(usePathname());
  const label = sections.find((s) => s.href === current)?.label;
  return <h1 className="page-title">{label && current !== "/admin" ? label : "Admin"}</h1>;
}
