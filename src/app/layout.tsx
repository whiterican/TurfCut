import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { InlineScript } from "@/components/InlineScript";
import { ThemeToggle } from "@/components/ThemeToggle";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Turfcut",
  description: "The marketplace for political field work.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      // Server renders dark (the primary theme); the inline script corrects
      // it before first paint, so React must accept the DOM's class.
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border bg-surface/80 backdrop-blur">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight text-fg">
              <span aria-hidden className="flex gap-0.5">
                <span className="dot bg-pink" />
                <span className="dot bg-lavender" />
                <span className="dot bg-mint" />
              </span>
              Turfcut
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
