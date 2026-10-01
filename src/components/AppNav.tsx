"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeTab, MESSAGES_HREF, type NavTab } from "@/lib/nav";
import { useUnreadCount } from "@/components/chat/UnreadProvider";

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="unread-badge" aria-hidden>
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Desktop: links in the top bar. */
export function TopNav({ tabs }: { tabs: NavTab[] }) {
  const current = activeTab(tabs, usePathname());
  const count = useUnreadCount();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className="topnav-link inline-flex items-center gap-1.5" aria-current={t.href === current ? "page" : undefined}>
          {t.label}
          {t.href === MESSAGES_HREF && <Badge count={count} />}
          {t.href === MESSAGES_HREF && count > 0 && <span className="sr-only">, {count} unread</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Phone and tablet: fixed bottom tab bar, as in the screen mockups. */
export function TabBar({ tabs }: { tabs: NavTab[] }) {
  const current = activeTab(tabs, usePathname());
  const count = useUnreadCount();
  if (tabs.length === 0) return null;
  return (
    <nav aria-label="Main" className="tabbar">
      <div className="mx-auto flex max-w-md">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className="tab" aria-current={t.href === current ? "page" : undefined}>
            <span aria-hidden className="tab-box">
              {t.href === MESSAGES_HREF && <Badge count={count} />}
            </span>
            {t.label}
            {t.href === MESSAGES_HREF && count > 0 && <span className="sr-only">, {count} unread</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}
