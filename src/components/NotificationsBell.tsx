"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useNoticesCount } from "@/components/NoticesProvider";

/**
 * The bell on a worker's phone (#111, screens 1 and 2): the concept puts it
 * beside the page title, and the phone has no site header there. From the
 * desktop width up the header's own bell shows instead, so this one hides.
 * The count is the one the root layout counted (NoticesProvider): no second
 * query, nothing read here.
 */
export function NotificationsBell() {
  const n = useNoticesCount();
  return (
    <Link href="/notifications" className="jobs-filter-btn relative lg:hidden" aria-label={n ? `Notifications, ${n} unread` : "Notifications"}>
      <Bell aria-hidden className="size-5" />
      {n > 0 && <span className="unread-badge absolute -top-1 -right-1" aria-hidden>{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}
