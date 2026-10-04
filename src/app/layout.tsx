import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import brandMark from "../../public/brand/icons/icon-96.png";
import { DM_Mono, DM_Sans, Newsreader } from "next/font/google";
import { OrgRail, OrgTabBar, TabBar, TopNav } from "@/components/AppNav";
import { InlineScript } from "@/components/InlineScript";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SlidersHorizontal } from "lucide-react";
import { UnreadProvider } from "@/components/chat/UnreadProvider";
import { ViewerKindProvider } from "@/components/ViewerKind";
import { PageTransition } from "@/components/PageTransition";
import { Haptics } from "@/components/Haptics";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { getSessionProfile } from "@/lib/auth";
import { MESSAGES_HREF, navTabs, orgNav } from "@/lib/nav";
import { db } from "@/lib/db";
import { unreadTotal } from "@/lib/chat-data";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Mastheads only: organization and job names at the top of a page (C1).
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "Turfcut",
  description: "The marketplace for political field work.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionProfile();
  const tabs = navTabs(session?.role ?? null, !!session?.orgId);
  const org = orgNav(session?.role ?? null, !!session?.orgId);
  const isOrg = org.rail.length > 0;
  const [unread, orgInfo] = await Promise.all([
    session && tabs.some((t) => t.href === MESSAGES_HREF)
      ? unreadTotal({ userId: session.userId, role: session.role, orgId: session.orgId }).catch(() => 0)
      : 0,
    isOrg && session?.orgId
      ? db().organization.findUnique({ where: { id: session.orgId }, select: { name: true, approved: true } }).catch(() => null)
      : null,
  ]);
  return (
    <html
      lang="en"
      // Server renders dark (the primary theme); the inline script corrects
      // it before first paint, so React must accept the DOM's class.
      className={`dark ${dmSans.variable} ${dmMono.variable} ${newsreader.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body className="min-h-full flex flex-col">
        <ViewerKindProvider kind={!session ? "none" : session.role === "WORKER" ? "worker" : session.orgId ? "org" : "none"}>
        <UnreadProvider initial={unread} enabled={tabs.some((t) => t.href === MESSAGES_HREF)}>
        <header className="site-header border-b border-border bg-surface/80 backdrop-blur">
          <div className={`mx-auto flex w-full ${isOrg ? "max-w-6xl" : "max-w-5xl"} items-center justify-between gap-3 px-4 py-3 sm:px-6`}>
            <Link href={session ? "/dashboard" : "/"} className="flex items-center gap-2 text-xl font-bold tracking-[-0.04em] text-fg">
              {/* The founder's pin-check-nib mark: lime on eggplant, the same in both
                  themes. The word is live text in the theme's ink. Static import +
                  unoptimized: served from /_next/static, saved offline by the service worker. */}
              <Image src={brandMark} alt="" width={28} height={28} unoptimized className="size-7 rounded-lg" />
              turfcut
            </Link>
            <div className="flex items-center gap-2">
              {!isOrg && <TopNav tabs={tabs} />}
              <Link href="/settings" className="btn-ghost btn-sm" title="Settings: text size, theme, sign out" aria-label="Settings">
                <SlidersHorizontal aria-hidden className="btn-icon" />
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </header>
        {isOrg ? (
          <div className="org-shell">
            <OrgRail tabs={org.rail} orgName={orgInfo?.name ?? "Your organization"} approved={orgInfo ? orgInfo.approved : null} />
            <div className="min-w-0 flex-1">
              <PageTransition>{children}</PageTransition>
            </div>
          </div>
        ) : (
          <PageTransition>{children}</PageTransition>
        )}
        <Haptics />
        {isOrg ? <OrgTabBar tabs={org.phone} more={org.more} /> : <TabBar tabs={tabs} />}
        </UnreadProvider>
        </ViewerKindProvider>
      </body>
    </html>
  );
}
