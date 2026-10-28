"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { activeAdminSection, type AdminSection } from "@/lib/admin-nav";

/**
 * The staff console's rail (redesign §4.2.1): the console's sections in the
 * eggplant frame, in place of an organization's rail, from 1024. Phones keep
 * the section chips under the heading.
 */
export function StaffRail({ sections }: { sections: AdminSection[] }) {
  const pathname = usePathname();
  const current = activeAdminSection(pathname);
  return (
    <aside className="org-rail staff-rail" aria-label="Turfcut staff">
      <div className="org-rail-head">
        <p className="masthead truncate text-lg">Admin</p>
        <p className="org-rail-status"><ShieldCheck aria-hidden className="size-3.5" /> Turfcut staff</p>
      </div>
      <nav aria-label="Main">
        <ul className="space-y-0.5">
          {sections.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="rail-link" aria-current={s.href === current ? (pathname.endsWith(s.href) ? "page" : "true") : undefined}>
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
