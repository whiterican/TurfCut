"use client";

import { useEffect } from "react";
import { FEED_SEEN_COOKIE } from "@/lib/campaign-follow";

/**
 * Remembers on this device that the feed was opened (S2.4): Today then
 * says how many posts are newer. A cookie, not a record: nothing is stored
 * about the worker anywhere but their own browser. The time is the
 * server's (the page's render), so a phone clock that runs fast or slow
 * doesn't skew the count.
 */
export function FeedSeen({ at }: { at: string }) {
  useEffect(() => {
    document.cookie = `${FEED_SEEN_COOKIE}=${at}; path=/; max-age=${400 * 24 * 60 * 60}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  }, [at]);
  return null;
}
