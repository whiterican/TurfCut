import { NoAccessNotice } from "@/components/NoAccessNotice";
import type { Metadata, Viewport } from "next";
import { inter } from "./fonts";
import { MenuButton, OrgRail, OrgTabBar } from "@/components/AppNav";
import { SignOutButton } from "@/components/SignOutButton";
import { signOut } from "@/app/settings/actions";
import { SiteHeader } from "@/components/SiteHeader";
import { InlineScript } from "@/components/InlineScript";
import { UnreadProvider } from "@/components/chat/UnreadProvider";
import { NoticesProvider } from "@/components/NoticesProvider";
import { ViewerKindProvider } from "@/components/ViewerKind";
import { PageTransition } from "@/components/PageTransition";
import { Haptics } from "@/components/Haptics";
import { PressTilt } from "@/components/PressTilt";
import { PullToRefresh } from "@/components/PullToRefresh";
import { ScrollDirection } from "@/components/ScrollDirection";
import { StatusStripColor } from "@/components/StatusStripColor";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { getSessionProfile } from "@/lib/auth";
import { getSiteUrl } from "@/lib/env";
import { MESSAGES_HREF, navTabs, orgNav, railPerson, workerMore } from "@/lib/nav";
import { db } from "@/lib/db";
import { unreadTotal } from "@/lib/chat-data";
import { unreadNotifications, UNREAD_CAP } from "@/lib/notifications-data";
import { unreadPostNotices } from "@/lib/campaign-follow-data";
import "./globals.css";

export function generateMetadata(): Metadata {
  // Absolute links in previews and feeds need the site's origin; with SITE_URL unset (development) Next's default is fine.
  const site = getSiteUrl();
  return {
    title: "Turfcut",
    description: "The marketplace for political field work.",
    ...(site ? { metadataBase: new URL(site) } : {}),
    // An installed iPhone app draws the page under the clock and battery (Caden, Nov 13): there is no strip of the
    // phone's own to fall out of step with the theme, the drawer or the page. The stylesheet keeps content clear
    // of it with env(safe-area-inset-*).
    appleWebApp: { capable: true, title: "Turfcut", statusBarStyle: "black-translucent" },
    // Next writes the newer "mobile-web-app-capable"; older iPhones read only Apple's own name for it.
    other: { "apple-mobile-web-app-capable": "yes" },
  };
}

/** The page reaches every edge of the screen, the notch and the home bar included; the stylesheet pads what must stay clear. */
// The colour of the page's top, by day and by night (--page-top in globals.css), for the strip a device draws above
// the page: a browser's toolbar, an installed app's window bar on a tablet. Some of them read it once, when the page
// loads, so it has to be in the page as it arrives; StatusStripColor then keeps every one of these tags on the colour
// the page is actually painted (the app's own theme, a chat, the drawer).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#d6c9ea" },
    { media: "(prefers-color-scheme: dark)", color: "#3c1f66" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The nav shows as signed out during an outage; the page itself still
  // throws (same cached call), so field pages answer 500, not a sign-in bounce.
  const session = await getSessionProfile().catch(() => null);
  const tabs = navTabs(session?.role ?? null, !!session?.orgId, session?.grants ?? null);
  const org = orgNav(session?.role ?? null, !!session?.orgId, !!session?.staff, session?.grants ?? null);
  const isOrg = org.rail.length > 0;
  const [unread, orgInfo, notices] = await Promise.all([
    session && tabs.some((t) => t.href === MESSAGES_HREF)
      ? unreadTotal({ userId: session.userId, role: session.role, grants: session.grants, orgId: session.orgId }).catch(() => 0)
      : 0,
    isOrg && session?.orgId
      ? db().organization.findUnique({ where: { id: session.orgId }, select: { name: true, approved: true } }).catch(() => null)
      : null,
    session
      ? unreadNotifications({ userId: session.userId, role: session.role, grants: session.grants, workerId: session.workerId ?? null, orgId: session.orgId ?? null }).catch(() => 0)
      : 0,
    // A worker's unread notices of followed campaigns' posts (S2.4), counted by the social layer.
    session?.role === "WORKER" && session.workerId ? unreadPostNotices(session.userId, UNREAD_CAP).catch(() => 0) : 0,
  ]).then(([u, o, hiringNotices, postNotices]) => [u, o, Math.min(hiringNotices + postNotices, UNREAD_CAP)] as const);
  return (
    <html
      lang="en"
      // Server renders dark (the primary theme); the inline script corrects
      // it before first paint, so React must accept the DOM's class.
      className={`dark ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body className="min-h-full flex flex-col">
        <ViewerKindProvider kind={!session ? "none" : session.role === "WORKER" ? "worker" : session.orgId ? "org" : "none"}>
        <UnreadProvider initial={unread} enabled={tabs.some((t) => t.href === MESSAGES_HREF)}>
        <NoticesProvider count={notices}>
        <SiteHeader signedIn={!!session} isOrg={isOrg} tabs={[]} notices={notices} workerPhone={session?.role === "WORKER"} menu={session && isOrg && org.phone.length > 0 && org.more.length > 0 ? <MenuButton /> : undefined} />
        {isOrg && session ? (
          <div className="org-shell">
            <OrgRail tabs={org.rail} orgName={orgInfo?.name ?? "Your organization"} approved={orgInfo ? orgInfo.approved : null} person={railPerson(session)} />
            <div id="content" tabIndex={-1} className="skip-target min-w-0 flex-1">
              <NoAccessNotice />
              <PageTransition>{children}</PageTransition>
            </div>
          </div>
        ) : session && tabs.length > 0 ? (
          // A worker: the same shell as an organization. From 768 up every destination is in the sidebar; a phone keeps the dock and the menu strip.
          <div className="org-shell" data-worker="">
            <OrgRail tabs={[...tabs, ...workerMore(session.role)]} person={railPerson(session)} foot={<SignOutButton action={signOut} userId={session.userId} />} />
            <div id="content" tabIndex={-1} className="skip-target flex min-w-0 flex-1 flex-col">
              {/* A worker's phone has no site header: the menu button gets a strip of its own above the page. */}
              <div className="phone-top">
                <MenuButton name={railPerson(session).name} photo={railPerson(session).photo} notices={notices} />
              </div>
              <NoAccessNotice />
              <PageTransition>{children}</PageTransition>
            </div>
          </div>
        ) : (
          <div id="content" tabIndex={-1} className="skip-target flex flex-1 flex-col">
            <NoAccessNotice />
            <PageTransition>{children}</PageTransition>
          </div>
        )}
        <Haptics />
        <PressTilt />
        <PullToRefresh />
        <ScrollDirection />
        <StatusStripColor />
        {isOrg ? (
          <OrgTabBar tabs={org.phone} more={org.more} person={session ? railPerson(session) : undefined} />
        ) : (
          // The worker's dock: Home · Jobs · Work · Map · Messages; the menu drawer holds the rest (Profile, Feed, Earnings, Settings, Sign out).
          <OrgTabBar tabs={tabs} more={workerMore(session?.role ?? null)} notices={notices} extra={session ? <SignOutButton action={signOut} userId={session.userId} /> : undefined} person={session ? railPerson(session) : undefined} />
        )}
        </NoticesProvider>
        </UnreadProvider>
        </ViewerKindProvider>
      </body>
    </html>
  );
}
