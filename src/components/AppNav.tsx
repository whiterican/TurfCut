"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, CalendarClock, LayoutDashboard, MessageCircle, Settings, Sun, User, Users, Wallet, type LucideIcon } from "lucide-react";
import { activeTab, MESSAGES_HREF, type NavTab } from "@/lib/nav";
import { useUnreadCount } from "@/components/chat/UnreadProvider";

/** One glyph per destination (lib/nav decides who gets which tabs). */
const ICONS: Record<string, LucideIcon> = {
  "/dashboard": Sun,
  "/jobs": Briefcase,
  "/shifts": CalendarClock,
  [MESSAGES_HREF]: MessageCircle,
  "/profile": User,
  "/workers": Users,
  "/payouts": Wallet,
  "/org/settings": Settings,
};
const iconFor = (t: NavTab): LucideIcon => (t.label === "Ops" ? LayoutDashboard : ICONS[t.href] ?? LayoutDashboard);

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="unread-badge" aria-hidden>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function Icon({ of: I, className }: { of: LucideIcon; className?: string }) {
  return <I aria-hidden className={className} strokeWidth={2} />;
}

/** The glyph for one tab, for anything that draws its own tab bar. */
export function TabIcon({ tab }: { tab: NavTab }) {
  return <Icon of={iconFor(tab)} className="tab-icon" />;
}

/** Desktop: links in the top bar. */
export function TopNav({ tabs }: { tabs: NavTab[] }) {
  const current = activeTab(tabs, usePathname());
  const count = useUnreadCount();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className="topnav-link inline-flex items-center gap-1.5" aria-current={t.href === current ? "page" : undefined}>
          <Icon of={iconFor(t)} className="size-4" />
          {t.label}
          {t.href === MESSAGES_HREF && <Badge count={count} />}
          {t.href === MESSAGES_HREF && count > 0 && <span className="sr-only">, {count} unread</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Phone and tablet: fixed bottom tab bar; a dot marks the current tab. */
export function TabBar({ tabs }: { tabs: NavTab[] }) {
  const current = activeTab(tabs, usePathname());
  const count = useUnreadCount();
  if (tabs.length === 0) return null;
  return (
    <nav aria-label="Main" className="tabbar">
      <div className="mx-auto flex max-w-md">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className="tab" aria-current={t.href === current ? "page" : undefined}>
            <Icon of={iconFor(t)} className="tab-icon" />
            {t.label}
            {t.href === MESSAGES_HREF && <Badge count={count} />}
            {t.href === MESSAGES_HREF && count > 0 && <span className="sr-only">, {count} unread</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}
