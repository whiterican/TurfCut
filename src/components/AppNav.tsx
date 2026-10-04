"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, CalendarClock, LayoutDashboard, MessageCircle, Settings, Sunrise, User, Users, Wallet, type LucideIcon } from "lucide-react";
import { activeTab, MESSAGES_HREF, type NavTab, type TabIconId } from "@/lib/nav";
import { useUnreadCount } from "@/components/chat/UnreadProvider";

/** One glyph per tab id (lib/nav decides who gets which tabs). Exhaustive: a new id fails to compile until it has a glyph. */
const ICONS: Record<TabIconId, LucideIcon> = {
  today: Sunrise, // not Sun: the theme toggle uses that
  work: Briefcase,
  shifts: CalendarClock,
  messages: MessageCircle,
  profile: User,
  ops: LayoutDashboard,
  jobs: Briefcase,
  people: Users,
  pay: Wallet,
  settings: Settings,
};
const iconFor = (t: NavTab): LucideIcon => ICONS[t.icon];

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="unread-badge" aria-hidden>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function Icon({ of: I, className }: { of: LucideIcon; className?: string }) {
  return <I aria-hidden className={className} />;
}

/** The glyph for one tab, for anything that draws its own tab bar (the local screenshot fixture does). */
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

/** Phone and tablet: fixed bottom tab bar; a tinted icon marks the current tab. */
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
