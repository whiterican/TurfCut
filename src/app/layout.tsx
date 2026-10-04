import type { Metadata } from "next";
import Link from "next/link";
import { DM_Mono, DM_Sans } from "next/font/google";
import { TabBar, TopNav } from "@/components/AppNav";
import { InlineScript } from "@/components/InlineScript";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SlidersHorizontal } from "lucide-react";
import { UnreadProvider } from "@/components/chat/UnreadProvider";
import { PageTransition } from "@/components/PageTransition";
import { Haptics } from "@/components/Haptics";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { getSessionProfile } from "@/lib/auth";
import { MESSAGES_HREF, navTabs } from "@/lib/nav";
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
  const unread =
    session && tabs.some((t) => t.href === MESSAGES_HREF)
      ? await unreadTotal({ userId: session.userId, role: session.role, orgId: session.orgId }).catch(() => 0)
      : 0;
  return (
    <html
      lang="en"
      // Server renders dark (the primary theme); the inline script corrects
      // it before first paint, so React must accept the DOM's class.
      className={`dark ${dmSans.variable} ${dmMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body className="min-h-full flex flex-col">
        <UnreadProvider initial={unread} enabled={tabs.some((t) => t.href === MESSAGES_HREF)}>
        <header className="site-header border-b border-border bg-surface/80 backdrop-blur">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Link href={session ? "/dashboard" : "/"} className="flex items-center gap-2 text-lg font-bold tracking-[-0.03em] text-fg">
              <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-hero">
                <span className="size-2.5 rounded-full bg-lime" />
              </span>
              Turfcut
            </Link>
            <div className="flex items-center gap-2">
              <TopNav tabs={tabs} />
              <Link href="/settings" className="btn-ghost btn-sm" title="Settings: text size, theme, sign out" aria-label="Settings">
                <SlidersHorizontal aria-hidden className="btn-icon" />
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </header>
        <PageTransition>{children}</PageTransition>
        <Haptics />
        <TabBar tabs={tabs} />
        </UnreadProvider>
      </body>
    </html>
  );
}
