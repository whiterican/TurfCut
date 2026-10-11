"use client";

import { useEffect } from "react";
import { FEED_SEEN_COOKIE } from "@/lib/campaign-follow";

/**
 * Remembers on this device that the feed was opened now (S2.4): Today
 * then says how many posts are newer. A cookie, not a record: nothing is
 * stored about the worker anywhere but their own browser.
 */
export function FeedSeen() {
  useEffect(() => {
    document.cookie = `${FEED_SEEN_COOKIE}=${new Date().toISOString()}; path=/; max-age=${400 * 24 * 60 * 60}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  }, []);
  return null;
}
