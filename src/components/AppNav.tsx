"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { BadgeCheck, Briefcase, CalendarClock, ClipboardList, Clock, Ellipsis, LayoutDashboard, Map, MessageCircle, Settings, Sunrise, User, Users, Wallet, X, type LucideIcon } from "lucide-react";
import { activeTab, MESSAGES_HREF, type NavTab, type TabIconId } from "@/lib/nav";
import { useUnreadCount } from "@/components/chat/UnreadProvider";

/** One glyph per tab id (lib/nav decides who gets which tabs). Exhaustive: a new id fails to compile until it has a glyph. */
const ICONS: Record<TabIconId, LucideIcon> = {
  today: Sunrise, // not Sun: the theme toggle uses that
  work: Briefcase,
  shifts: CalendarClock,
  messages: MessageCircle,
  profile: User,
  desk: LayoutDashboard,
  hiring: ClipboardList,
  jobs: Briefcase,
  field: Map,
  pay: Wallet,
  members: Users,
  settings: Settings,
  more: Ellipsis,
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

/** Desktop (lg): the organization's left rail — its name and approval, then every area the role reaches. */
export function OrgRail({ tabs, orgName, approved }: { tabs: NavTab[]; orgName: string; approved: boolean }) {
  const current = activeTab(tabs, usePathname());
  const count = useUnreadCount();
  return (
    <aside className="org-rail" aria-label="Organization">
      <div className="org-rail-head">
        <p className="masthead truncate text-lg" title={orgName}>{orgName}</p>
        {approved ? (
          <p className="org-rail-status"><BadgeCheck aria-hidden className="size-3.5" /> Approved</p>
        ) : (
          <p className="org-rail-status"><Clock aria-hidden className="size-3.5" /> Awaiting Turfcut approval</p>
        )}
      </div>
      <nav aria-label="Main">
        <ul className="space-y-0.5">
          {tabs.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="rail-link" aria-current={t.href === current ? "page" : undefined}>
                <Icon of={iconFor(t)} className="size-4 shrink-0" />
                <span className="flex-1">{t.label}</span>
                {t.href === MESSAGES_HREF && <Badge count={count} />}
                {t.href === MESSAGES_HREF && count > 0 && <span className="sr-only">, {count} unread</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

/** Phone and tablet, organization roles: the role's tabs, and More for the rest (a sheet). */
export function OrgTabBar({ tabs, more }: { tabs: NavTab[]; more: NavTab[] }) {
  const pathname = usePathname();
  const current = activeTab([...tabs, ...more], pathname);
  const count = useUnreadCount();
  const [open, setOpen] = useState(false);
  const sheetId = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const inMore = more.some((t) => t.href === current);

  // Close on navigation (reset during render when the path changes).
  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    if (open) setOpen(false);
  }
  // Escape closes and returns focus; opening moves focus into the sheet.
  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (tabs.length === 0) return null;
  return (
    <>
      {open && <button type="button" aria-label="Close menu" tabIndex={-1} className="more-backdrop" onClick={() => setOpen(false)} />}
      {open && (
        <div ref={sheet} id={sheetId} role="dialog" aria-modal="true" aria-label="More" className="more-sheet">
          <div className="mb-2 flex items-center justify-between">
            <p className="eyebrow">More</p>
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setOpen(false); button.current?.focus(); }} aria-label="Close">
              <X aria-hidden className="btn-icon" />
            </button>
          </div>
          <ul className="space-y-0.5">
            {more.map((t) => (
              <li key={t.href}>
                <Link href={t.href} className="rail-link" aria-current={t.href === current ? "page" : undefined}>
                  <Icon of={iconFor(t)} className="size-4 shrink-0" />
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
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
          {more.length > 0 && (
            <button
              ref={button}
              type="button"
              className="tab"
              aria-expanded={open}
              aria-controls={sheetId}
              aria-current={inMore ? "page" : undefined}
              onClick={() => setOpen((o) => !o)}
            >
              <Icon of={Ellipsis} className="tab-icon" />
              More
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
