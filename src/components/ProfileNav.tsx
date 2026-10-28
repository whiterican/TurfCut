"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { profileSectionCurrent, PROFILE_SECTIONS } from "@/lib/profile-nav";

/** The worker's profile sections (redesign §5): a sub-nav on the left from 1024, a menu of rows on a phone. */
export function ProfileNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Profile" className="list-card">
      <ul>
        {PROFILE_SECTIONS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="rail-link rounded-none px-4" aria-current={profileSectionCurrent(s.href, pathname)}>
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
