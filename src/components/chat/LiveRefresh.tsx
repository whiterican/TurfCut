"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { subscribeToChat } from "@/components/chat/live";

export const POLL_MS = 15_000;

/**
 * Keeps an open thread current: Realtime when it's connected, otherwise a
 * refresh every 15 seconds. Refreshing re-renders on the server, which also
 * marks the thread read. Paused while the tab is hidden.
 */
export function LiveRefresh({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  useEffect(() => {
    let live = false;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const poll = window.setInterval(() => {
      if (!live) refresh();
    }, POLL_MS);
    const stop = subscribeToChat({
      channel: `conversation:${conversationId}`,
      conversationId,
      onChange: refresh,
      onStatus: (up) => {
        live = up;
      },
    });
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(poll);
      stop();
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [conversationId, router]);
  return null;
}
