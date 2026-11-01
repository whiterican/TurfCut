import Image from "next/image";
import Link from "next/link";
import { Bell, SlidersHorizontal } from "lucide-react";
import brandMark from "../../public/brand/icons/icon-96.png";
import { TopNav } from "@/components/AppNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { NavTab } from "@/lib/nav";

/**
 * The header every page shares (redesign §4.2.1): the skip link, the mark
 * and wordmark, the worker's desktop nav, the bell, settings and the theme.
 * Its height is pinned, so its gutters, gaps and mark are in px like its
 * buttons: a 320px phone at 200% text keeps it inside the screen.
 * The root layout draws it; so does the local preview harness, which passes
 * `base` so its links stay inside the harness.
 */
export function SiteHeader({
  signedIn,
  isOrg,
  tabs,
  notices,
  base = "",
  contentId = "content",
  workerPhone = false,
}: {
  signedIn: boolean;
  isOrg: boolean;
  /** The desktop top-bar tabs (workers only; organizations use the rail). */
  tabs: NavTab[];
  notices: number;
  base?: string;
  /** Where the skip link lands: the page's content wrapper. */
  contentId?: string;
  /** A worker on a phone (#111): the concept has no header there, so the bar shows from the desktop width up only. */
  workerPhone?: boolean;
}) {
  const at = (href: string) => `${base}${href}`;
  return (
    <>
      <a href={`#${contentId}`} className="skip-link">Skip to content</a>
      <header className={`site-header border-b ${workerPhone ? "site-header-worker" : ""}`}>
        <div className={`mx-auto flex w-full ${isOrg ? "max-w-[var(--workspace-max)]" : "max-w-[var(--worker-frame)]"} site-header-bar items-center justify-between gap-[12px] px-[16px] sm:px-[24px]`}>
          <Link href={at(!signedIn ? "/" : isOrg ? "/desk" : "/dashboard")} className="flex shrink-0 items-center gap-[8px] text-[20px] font-bold tracking-[-0.04em] text-fg">
            {/* The founder's pin-check-nib mark, the same in every theme. The word is live text in the
                theme's ink. Static import + unoptimized: served from /_next/static, saved offline by the service worker. */}
            <Image src={brandMark} alt="" width={28} height={28} unoptimized className="size-[28px] rounded-lg" />
            {/* The wordmark: lowercase, with "cut" in the kicker colour. */}
            <span>turf<span className="wordmark-cut">cut</span></span>
          </Link>
          <div className="flex items-center gap-[8px]">
            {!isOrg && <TopNav tabs={tabs.map((t) => ({ ...t, href: at(t.href), also: t.also?.map(at) }))} />}
            {signedIn && (
              <Link href={at("/notifications")} className="btn-ghost btn-sm relative" aria-label={notices ? `Notifications, ${notices} unread` : "Notifications"}>
                <Bell aria-hidden className="btn-icon" />
                {notices > 0 && <span className="unread-badge" aria-hidden>{notices > 99 ? "99+" : notices}</span>}
              </Link>
            )}
            <Link href={at("/settings")} className="btn-ghost btn-sm" title="Settings: text size, theme, sign out" aria-label="Settings">
              <SlidersHorizontal aria-hidden className="btn-icon" />
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
    </>
  );
}
