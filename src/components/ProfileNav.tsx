"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeTab, type NavTab } from "@/lib/nav";

/** The worker's profile sections (redesign §5): a sub-nav on the left from 1024, a menu of rows on a phone. */
const SECTIONS: NavTab[] = [
  { href: "/profile", label: "Profile", icon: "profile" },
  { href: "/earnings", label: "Earnings", icon: "pay" },
  { href: "/profile/availability", label: "Availability", icon: "shifts" },
  { href: "/profile/credentials", label: "Credentials", icon: "credentials" },
  { href: "/profile/sharing", label: "Who sees what", icon: "members" },
  { href: "/profile/preferences", label: "Political preferences", icon: "settings" },
  { href: "/profile/preview", label: "What organizations see", icon: "feed" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function ProfileNav() {
  const pathname = usePathname();
  // Sections are matched exactly or below; /profile itself only on its own page.
  const current = pathname.endsWith("/profile") ? SECTIONS[0].href : activeTab(SECTIONS.slice(1), pathname.replace(/^.*?(?=\/(profile|earnings|settings)(\/|$))/, ""));
  return (
    <nav aria-label="Profile" className="list-card">
      <ul>
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="rail-link rounded-none px-4" aria-current={s.href === current ? "page" : undefined}>
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
