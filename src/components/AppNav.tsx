"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeTab, type NavTab } from "@/lib/nav";

/** Desktop: links in the top bar. */
export function TopNav({ tabs }: { tabs: NavTab[] }) {
  const current = activeTab(tabs, usePathname());
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className="topnav-link" aria-current={t.href === current ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Phone and tablet: fixed bottom tab bar, as in the screen mockups. */
export function TabBar({ tabs }: { tabs: NavTab[] }) {
  const current = activeTab(tabs, usePathname());
  if (tabs.length === 0) return null;
  return (
    <nav aria-label="Main" className="tabbar">
      <div className="mx-auto flex max-w-md">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className="tab" aria-current={t.href === current ? "page" : undefined}>
            <span aria-hidden className="tab-dot" />
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
