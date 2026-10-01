"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Supabase Realtime for chat. Row-level security decides which rows reach
 * this browser (only conversations the user can read), so the payload is
 * used only as a "something changed" signal — the server re-renders what
 * the user may see. Returns a cleanup function, and reports whether the
 * live channel is up so callers can fall back to polling.
 */
export function subscribeToChat(opts: {
  channel: string;
  conversationId?: string;
  onChange: () => void;
  onStatus: (live: boolean) => void;
}): () => void {
  let cleanup = () => {};
  let cancelled = false;
  try {
    const sb = createClient();
    void (async () => {
      // Realtime evaluates RLS as the signed-in user.
      const { data } = await sb.auth.getSession();
      if (cancelled) return;
      if (!data.session) return opts.onStatus(false);
      await sb.realtime.setAuth(data.session.access_token);
      const filter = opts.conversationId ? { filter: `conversationId=eq.${opts.conversationId}` } : {};
      const channel = sb
        .channel(opts.channel)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "Message", ...filter }, opts.onChange)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "MessageRevision", ...filter }, opts.onChange)
        .subscribe((status) => opts.onStatus(status === "SUBSCRIBED"));
      cleanup = () => void sb.removeChannel(channel);
      if (cancelled) cleanup();
    })().catch(() => opts.onStatus(false));
  } catch {
    opts.onStatus(false); // Supabase env not set: polling only
  }
  return () => {
    cancelled = true;
    cleanup();
  };
}
