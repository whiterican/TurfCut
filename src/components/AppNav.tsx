"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { BadgeCheck, Briefcase, CalendarClock, ClipboardList, Clock, Ellipsis, LayoutDashboard, Map, MessageCircle, Settings, Sunrise, User, Users, Wallet, X, type LucideIcon } from "lucide-react";
import { activeTab, MESSAGES_HREF, type NavTab, type TabIconId } from "@/lib/nav";
import { MIN_DELTA, nextHidden, SHOW_NEAR_TOP } from "@/lib/scroll-hide";
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

/**
 * True while the phone tab bar should be tucked away: scrolling down hides
 * it, scrolling up shows it (lib/scroll-hide). CSS keeps it on screen anyway
 * with reduced motion, while it holds keyboard focus, and in chat threads.
 * One read per frame; small moves wait until they add up to a real scroll.
 */
function useTuckOnScroll(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let current = false;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        if (Math.abs(y - last) < MIN_DELTA && y > SHOW_NEAR_TOP) return;
        current = nextHidden(current, last, y);
        last = y;
        setHidden(current);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return hidden;
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

/** Phone and tablet: a floating bottom tab bar that tucks away on scroll; a tinted icon marks the current tab. */
export function TabBar({ tabs }: { tabs: NavTab[] }) {
  const current = activeTab(tabs, usePathname());
  const count = useUnreadCount();
  const tucked = useTuckOnScroll();
  if (tabs.length === 0) return null;
  return (
    <nav aria-label="Main" className="tabbar" data-tucked={tucked || undefined}>
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
export function OrgRail({ tabs, orgName, approved }: { tabs: NavTab[]; orgName: string; approved: boolean | null }) {
  const current = activeTab(tabs, usePathname());
  const count = useUnreadCount();
  return (
    <aside className="org-rail" aria-label="Organization">
      <div className="org-rail-head">
        <p className="masthead truncate text-lg" title={orgName}>{orgName}</p>
        {/* null = couldn't load it: say nothing rather than something false. */}
        {approved === true && <p className="org-rail-status"><BadgeCheck aria-hidden className="size-3.5" /> Approved</p>}
        {approved === false && <p className="org-rail-status"><Clock aria-hidden className="size-3.5" /> Awaiting Turfcut approval</p>}
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

/**
 * Phone and tablet, organization roles: the role's tabs, and More for the
 * rest. More is a native modal <dialog>: the browser traps focus, makes the
 * page behind it inert, closes on Escape and returns focus to More.
 */
export function OrgTabBar({ tabs, more }: { tabs: NavTab[]; more: NavTab[] }) {
  const pathname = usePathname();
  const current = activeTab([...tabs, ...more], pathname);
  const count = useUnreadCount();
  const [open, setOpen] = useState(false);
  const sheetId = useId();
  const sheet = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const inMore = more.some((t) => t.href === current);
  const tucked = useTuckOnScroll();

  // Close on navigation (reset during render when the path changes).
  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    if (open) setOpen(false);
  }
  // Nothing left to show (e.g. the role changed): the sheet can't stay open.
  if (open && more.length === 0) setOpen(false);
  // Keep the dialog in step with state; focus the first item on opening.
  useEffect(() => {
    const d = sheet.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>("a")?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  // The sheet is phone-only: widening past the phone layout closes it, or
  // the page would stay inert behind a hidden modal.
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia("(min-width: 64rem)");
    const onChange = () => wide.matches && setOpen(false);
    onChange();
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, [open]);

  if (tabs.length === 0) return null;
  const close = () => setOpen(false);
  return (
    <>
      {more.length > 0 && (
        <dialog
          ref={sheet}
          id={sheetId}
          aria-label="More"
          className="more-sheet"
          // Escape, or close() from anywhere: sync state and hand focus back to More.
          onClose={() => {
            setOpen(false);
            // Not when widening hid the bar: focus can't go to a hidden button.
            if (button.current?.offsetParent) button.current.focus();
          }}
          // A press on the dimmed area outside the panel lands on the dialog itself.
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="more-sheet-panel">
            <div className="mb-2 flex items-center justify-between">
              <p className="eyebrow">More</p>
              <button type="button" className="btn-ghost btn-sm" onClick={close} aria-label="Close">
                <X aria-hidden className="btn-icon" />
              </button>
            </div>
            <ul className="space-y-0.5">
              {more.map((t) => (
                <li key={t.href}>
                  {/* Closes even when the link is the page you're on (no navigation happens). */}
                  <Link href={t.href} className="rail-link" onClick={close} aria-current={t.href === current ? "page" : undefined}>
                    <Icon of={iconFor(t)} className="size-4 shrink-0" />
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </dialog>
      )}
      <nav aria-label="Main" className="tabbar" data-tucked={tucked || undefined}>
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
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={sheetId}
              aria-current={inMore ? "page" : undefined}
              onClick={() => setOpen(true)}
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
