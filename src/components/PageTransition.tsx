"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

/**
 * Animated page changes (React <ViewTransition> + the browser's View
 * Transitions API; browsers without it just swap pages). Keyed by path, so
 * every navigation — including within a section, like a thread list to a
 * thread — enters and exits; refreshes on the same page don't animate.
 *
 * Links tagged `transitionTypes={["nav-forward"]}` / `["nav-back"]` slide
 * sideways; everything else (tabs, buttons) gently fades and rises.
 * Header and tab bar stay put (see globals.css). Respects reduced motion.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition
      key={pathname}
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-in" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-out" }}
      default="none"
    >
      <div className="flex flex-1 flex-col">{children}</div>
    </ViewTransition>
  );
}
