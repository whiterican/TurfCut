import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { OrgRail, OrgTabBar } from "@/components/AppNav";
import { SignOutButton } from "@/components/SignOutButton";
import { signOut } from "@/app/settings/actions";
import { SiteHeader } from "@/components/SiteHeader";
import { InlineScript } from "@/components/InlineScript";
import { UnreadProvider } from "@/components/chat/UnreadProvider";
import { ViewerKindProvider } from "@/components/ViewerKind";
import { PageTransition } from "@/components/PageTransition";
import { Haptics } from "@/components/Haptics";
import { PullToRefresh } from "@/components/PullToRefresh";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { getSessionProfile } from "@/lib/auth";
import { getSiteUrl } from "@/lib/env";
import { MESSAGES_HREF, navTabs, orgNav, railPerson, topNavTabs, workerMore } from "@/lib/nav";
import { db } from "@/lib/db";
import { unreadTotal } from "@/lib/chat-data";
import { unreadNotifications, UNREAD_CAP } from "@/lib/notifications-data";
import { unreadPostNotices } from "@/lib/campaign-follow-data";
import "./globals.css";

// The one face (#111): Inter for every role, the four weights the type scale
// uses. Figures take tabular numerals from the CSS, not a second font.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export function generateMetadata(): Metadata {
  // Absolute links in previews and feeds need the site's origin; with SITE_URL unset (development) Next's default is fine.
  const site = getSiteUrl();
  return {
    title: "Turfcut",
    description: "The marketplace for political field work.",
    ...(site ? { metadataBase: new URL(site) } : {}),
  };
}

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
        <SiteHeader signedIn={!!session} isOrg={isOrg} tabs={topNavTabs(session?.role ?? null)} notices={notices} />
        {isOrg && session ? (
          <div className="org-shell">
            <OrgRail tabs={org.rail} orgName={orgInfo?.name ?? "Your organization"} approved={orgInfo ? orgInfo.approved : null} person={railPerson(session)} />
            <div id="content" tabIndex={-1} className="skip-target min-w-0 flex-1">
              <PageTransition>{children}</PageTransition>
            </div>
          </div>
        ) : (
          <div id="content" tabIndex={-1} className="skip-target flex flex-1 flex-col">
            <PageTransition>{children}</PageTransition>
          </div>
        )}
        <Haptics />
        <PullToRefresh />
        {isOrg ? (
          <OrgTabBar tabs={org.phone} more={org.more} />
        ) : (
          // The worker's dock: Home · Jobs · Work · Map · Messages · More (Profile, Feed, Earnings, Settings, Sign out).
          <OrgTabBar tabs={tabs} more={workerMore(session?.role ?? null)} extra={session ? <SignOutButton action={signOut} userId={session.userId} /> : undefined} />
        )}
        </UnreadProvider>
        </ViewerKindProvider>
      </body>
    </html>
  );
}
