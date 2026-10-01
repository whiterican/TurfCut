"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { unreadCount } from "@/app/messages/actions";
import { subscribeToChat } from "@/components/chat/live";

const load = (set: (n: number) => void, alive: () => boolean) =>
  unreadCount()
    .then((n) => alive() && set(n))
    .catch(() => {});

/**
 * The Messages tab's unread count. Starts from the server's number, then
 * updates on new messages (Realtime), on every navigation (opening a thread
 * marks it read), and every 30 seconds as a fallback.
 */
export function useUnread(initial: number, enabled: boolean): number {
  const [count, setCount] = useState(initial);
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const refresh = () => load(setCount, () => alive);
    const poll = window.setInterval(() => document.visibilityState === "visible" && refresh(), 30_000);
    const stop = subscribeToChat({ channel: "unread", onChange: refresh, onStatus: () => {} });
    return () => {
      alive = false;
      window.clearInterval(poll);
      stop();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    load(setCount, () => alive);
    return () => {
      alive = false;
    };
  }, [enabled, pathname]);

  return enabled ? count : 0;
}
