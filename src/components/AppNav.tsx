"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BadgeCheck, Bell, Briefcase, CalendarCheck, CalendarClock, ChevronRight, ClipboardList, Clock, Footprints, House, LayoutDashboard, Map, MapPin, Megaphone, Menu, MessageCircle, Newspaper, ReceiptText, Settings, ShieldCheck, Sunrise, User, Users, Wallet, X, type LucideIcon } from "lucide-react";
import { activeTab, MESSAGES_HREF, type NavTab, type TabIconId } from "@/lib/nav";
import { clampScroll, MIN_DELTA, nextHidden, SHOW_NEAR_TOP } from "@/lib/scroll-hide";
import { closesDrawer, opensDrawer, SWIPE_OWNERS, tracksTouch, type Point } from "@/lib/edge-swipe";
import { useUnreadCount } from "@/components/chat/UnreadProvider";

/** One glyph per tab id (lib/nav decides who gets which tabs). Exhaustive: a new id fails to compile until it has a glyph. */
const ICONS: Record<TabIconId, LucideIcon> = {
  campaigns: Megaphone,
  home: House,
  today: Sunrise, // not Sun: the theme toggle uses that
  feed: Newspaper,
  work: Footprints, // not Briefcase: that's Jobs, and the two sat side by side (tablet pass, #136)
  shifts: CalendarClock,
  messages: MessageCircle,
  profile: User,
  desk: LayoutDashboard,
  hiring: ClipboardList,
  jobs: Briefcase,
  field: Map,
  pay: Wallet,
  members: Users,
  credentials: BadgeCheck,
  settings: Settings,
  admin: ShieldCheck,
  map: MapPin,
  earnings: Wallet,
  receipts: ReceiptText,
  availability: CalendarCheck,
  notifications: Bell,
  more: Menu,
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
    const position = () => clampScroll(window.scrollY, document.documentElement.scrollHeight - window.innerHeight);
    let last = position();
    let current = false;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = position();
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


/** The current tab is "page" only on its own page; under it (a job, /feed under Home, /shifts under Jobs) it is the current section. */
function currentAttr(href: string, current: string | null | undefined, pathname: string | null): "page" | "true" | undefined {
  if (href !== current) return undefined;
  return pathname === href ? "page" : "true";
}

/** Desktop: links in the top bar. */
export function TopNav({ tabs }: { tabs: NavTab[] }) {
  const pathname = usePathname();
  const current = activeTab(tabs, pathname);
  const count = useUnreadCount();
  // No tabs, no landmark (an empty "Main" nav would compete with the page's own).
  if (tabs.length === 0) return null;
  return (
    <nav aria-label="Main" className="topnav items-center gap-1">
      {tabs.map((t) => (
        // Between 1024 and 1279 the eight destinations fit only as icons (#113 review): the label stays the link's name and its tooltip, and shows from 1280.
        <Link key={t.href} href={t.href} title={t.label} className="topnav-link inline-flex items-center gap-1.5" aria-current={currentAttr(t.href, current, pathname)}>
          <Icon of={iconFor(t)} className="size-4" />
          <span className="sr-only whitespace-nowrap! xl:not-sr-only">{t.label}</span>
          {t.href === MESSAGES_HREF && <Badge count={count} />}
          {t.href === MESSAGES_HREF && count > 0 && <span className="sr-only">, {count} unread</span>}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Desktop (lg): the organization's full-height rail (redesign §4.2.1) — its
 * name and approval at the top, every area the role reaches, and who is
 * signed in at the bottom.
 */
export function OrgRail({ tabs, orgName, approved = null, person, foot }: { tabs: NavTab[]; /** The organization's name; a worker's sidebar has no head. */ orgName?: string; approved?: boolean | null; person: { name: string; role: string }; /** Drawn under the person (the worker's Sign out). */ foot?: ReactNode }) {
  const pathname = usePathname();
  const current = activeTab(tabs, pathname);
  const count = useUnreadCount();
  return (
    <aside className="org-rail" aria-label={orgName ? "Organization" : "Sidebar"}>
      {orgName && (
        <div className="org-rail-head">
          <p className="masthead truncate text-lg" title={orgName}>{orgName}</p>
          {/* null = couldn't load it: say nothing rather than something false. */}
          {approved === true && <p className="org-rail-status"><BadgeCheck aria-hidden className="size-3.5" /> Approved</p>}
          {approved === false && <p className="org-rail-status"><Clock aria-hidden className="size-3.5" /> Awaiting Turfcut approval</p>}
        </div>
      )}
      <nav aria-label="Main">
        <ul className="space-y-0.5">
          {tabs.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="rail-link" aria-current={currentAttr(t.href, current, pathname)}>
                <Icon of={iconFor(t)} className="size-4 shrink-0" />
                <span className="flex-1">{t.label}</span>
                {t.href === MESSAGES_HREF && <Badge count={count} />}
                {t.href === MESSAGES_HREF && count > 0 && <span className="sr-only">, {count} unread</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="org-rail-foot">
        <p className="org-rail-status">Signed in as</p>
        <p className="truncate font-semibold" title={person.name}>{person.name}</p>
        <p className="truncate org-rail-status">{person.role}</p>
        {foot && <div className="pt-3">{foot}</div>}
      </div>
    </aside>
  );
}

/** The event the menu button sends and the dock's drawer listens for (they sit in different parts of the page). */
const OPEN_MENU = "tc:open-menu";

/**
 * Opens the menu drawer (the rest of the role's places). It sits at the top left: in a strip above a worker's
 * phone pages, and in the site header where the header shows beside the dock. `name` draws the person's
 * initial and first name; without it the button is the menu glyph alone.
 */
export function MenuButton({ name, notices = 0 }: { name?: string; notices?: number }) {
  // The first name; an account with no name set shows the part of its email before the @, never the whole address.
  const first = name?.trim().split(/\s+/)[0]?.split("@")[0];
  return (
    <button type="button" className="menu-button" data-named={first ? "" : undefined} aria-haspopup="dialog" aria-label={`Menu${first ? `, ${first}` : ""}${notices > 0 ? `, ${notices} unread ${notices === 1 ? "notification" : "notifications"}` : ""}`} onClick={() => window.dispatchEvent(new Event(OPEN_MENU))}>
      {first ? <span className="menu-avatar" aria-hidden>{first[0]?.toUpperCase()}</span> : <Icon of={Menu} className="size-5" />}
      {first && <span className="menu-name" aria-hidden>{first}</span>}
      {notices > 0 && <span className="menu-dot" aria-hidden />}
    </button>
  );
}

/**
 * Phone and tablet: the role's tabs in a pill, and a drawer from the left for the rest (workers and
 * organization roles alike), opened by MenuButton. The drawer is a native modal
 * <dialog>: the browser traps focus, makes the page behind it inert, closes on
 * Escape and returns focus to the menu button. `extra` is drawn under the list
 * (the worker's Sign out); `person` heads the drawer.
 */
export function OrgTabBar({ tabs, more, extra, notices = 0, person }: { tabs: NavTab[]; more: NavTab[]; extra?: ReactNode; /** Heads the drawer: who is signed in. */ person?: { name: string; role: string }; /** Unread notifications, shown on the Notifications row (the worker's phone has no header bell). */ notices?: number; }) {
  const pathname = usePathname();
  const current = activeTab([...tabs, ...more], pathname);
  const count = useUnreadCount();
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);
  const tucked = useTuckOnScroll();

  // Close on navigation (reset during render when the path changes).
  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    if (open) setOpen(false);
  }
  // The menu button lives outside this component (the phone strip, the site header).
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_MENU, onOpen);
    return () => window.removeEventListener(OPEN_MENU, onOpen);
  }, []);
  // A swipe in from either edge of the screen opens the drawer, and a swipe left on it closes it
  // (lib/edge-swipe). Phones only: from 768 the sidebar is always there. A touch that begins on
  // something with its own sideways drag (a job card, a map, a field) is left alone.
  const hasMore = more.length > 0;
  useEffect(() => {
    if (!hasMore) return;
    const phone = window.matchMedia("(max-width: 47.99rem)");
    let start: Point | null = null;
    let onDrawer = false;
    const at = (e: TouchEvent): Point => ({ x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY });
    // Inside something that scrolls sideways (a chip row, a wide table): the drag is that thing's scroll.
    const inSidewaysScroller = (el: Element | null) => {
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        if (n.scrollWidth > n.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true;
      }
      return false;
    };
    const onStart = (e: TouchEvent) => {
      start = null;
      const target = e.target instanceof Element ? e.target : null;
      onDrawer = !!target?.closest(".more-sheet");
      const tracked = tracksTouch({
        phone: phone.matches,
        touches: e.touches.length,
        onDrawer,
        otherDialogOpen: !onDrawer && !!document.querySelector("dialog[open]"),
        onOwner: !!target?.closest(SWIPE_OWNERS),
        inScroller: inSidewaysScroller(target),
        // Not on the admin console or in print, where the dock and menu button are hidden.
        menuVisible: [...document.querySelectorAll(".menu-button")].some((b) => b.getClientRects().length > 0),
        zoomed: (window.visualViewport?.scale ?? 1) > 1.01,
        start: at(e),
        width: window.innerWidth,
      });
      if (tracked) start = at(e);
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const end = at(e);
      if (onDrawer ? closesDrawer(start, end) : opensDrawer(start, end, window.innerWidth)) setOpen(!onDrawer);
      start = null;
    };
    const onCancel = () => {
      start = null;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };
  }, [hasMore]);
  // Nothing left to show (e.g. the role changed): the sheet can't stay open.
  if (open && more.length === 0) setOpen(false);
  // Keep the dialog in step with state; focus the panel on opening.
  useEffect(() => {
    const d = sheet.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Focus the panel, not its first row: the first row would show a focus ring nobody asked for on touch. Tab goes to the rows.
      d.querySelector<HTMLElement>(".more-sheet-panel")?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  // The sheet goes with the dock: widening past it closes the sheet, or
  // the page would stay inert behind a hidden modal.
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia("(min-width: 48rem)");
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
          aria-label="Menu"
          className="more-sheet"
          // Escape, or close() from anywhere: sync state and hand focus back to the menu button.
          onClose={() => {
            setOpen(false);
            // The visible menu button; when widening hid them all, focus goes to the page.
            const trigger = [...document.querySelectorAll<HTMLElement>(".menu-button")].find((b) => b.offsetParent);
            (trigger ?? document.getElementById("content"))?.focus();
          }}
          // A press on the dimmed area outside the panel lands on the dialog itself.
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="more-sheet-panel" tabIndex={-1}>
            <div className="mb-2 flex items-center justify-between">
              {person ? (
                <p className="min-w-0">
                  <span className="block truncate text-lg font-semibold text-fg">{person.name}</span>
                  <span className="block truncate text-sm text-muted">{person.role}</span>
                </p>
              ) : (
                <p className="eyebrow">Menu</p>
              )}
              <button type="button" className="btn-ghost btn-sm" onClick={close} aria-label="Close">
                <X aria-hidden className="btn-icon" />
              </button>
            </div>
            <ul className="more-list">
              {more.map((t) => (
                <li key={t.href}>
                  {/* Closes even when the link is the page you're on (no navigation happens). */}
                  <Link href={t.href} className="rail-link more-row" onClick={close} aria-current={currentAttr(t.href, current, pathname)}>
                    <Icon of={iconFor(t)} className="size-5 shrink-0" />
                    <span className="flex-1">{t.label}</span>
                    {t.icon === "notifications" && notices > 0 && (
                      <>
                        <span className="unread-badge" aria-hidden>{notices > 99 ? "99+" : notices}</span>
                        <span className="sr-only">, {notices} unread</span>
                      </>
                    )}
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
            {extra && <div className="more-extra">{extra}</div>}
          </div>
        </dialog>
      )}
      <nav aria-label="Main" className="tabbar" data-tucked={tucked || undefined}>
        <div className="flex">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} className="tab" aria-current={currentAttr(t.href, current, pathname)}>
              <Icon of={iconFor(t)} className="tab-icon" />
              <span className="tab-label">{t.label}</span>
              {t.href.endsWith(MESSAGES_HREF) && <Badge count={count} />}
              {t.href.endsWith(MESSAGES_HREF) && count > 0 && <span className="sr-only">, {count} unread</span>}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
