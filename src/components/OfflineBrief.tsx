"use client";

import { useEffect } from "react";
import { flushAll } from "@/lib/offline-queue";

/**
 * Turns on the offline brief for a worker (public/sw.js) and tells it which
 * field pages to keep for this person — saving them now, while there's
 * signal (e.g. tomorrow's shift, so its staging point, turf and contacts
 * open in a dead zone). Also sends any field entries still waiting on this
 * phone, for every shift, not just the one on screen.
 *
 * Production only: in development the cache-first build files would serve
 * stale code after every edit, so any registration is removed instead.
 */
export function OfflineBrief({ userId, paths }: { userId: string; paths: string[] }) {
  const key = paths.join("|");
  useEffect(() => {
    // Shift pages saved for dead zones should show what just synced.
    const send = () =>
      void flushAll(userId)
        .then((r) => {
          if (!r.savedShifts.length) return;
          for (const p of ["/dashboard", "/shifts", ...r.savedShifts.map((id) => `/shifts/${id}`)]) refreshSavedPage(userId, p);
        })
        .catch(() => {});
    const first = setTimeout(send, 0);
    window.addEventListener("online", send);
    let cancelled = false;
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV !== "production") {
        void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
      } else {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then(async () => {
            const reg = await navigator.serviceWorker.ready;
            if (!cancelled) reg.active?.postMessage({ type: "save-pages", user: userId, paths: key ? key.split("|") : [] });
            // Load the map's code once while there's signal, so it's saved too.
            if (navigator.serviceWorker.controller) void import("leaflet").catch(() => {});
          })
          .catch(() => {
            // Offline brief unavailable (e.g. private browsing): the app still works online.
          });
      }
    }
    return () => {
      cancelled = true;
      clearTimeout(first);
      window.removeEventListener("online", send);
    };
  }, [key, userId]);
  return null;
}

/** Tells the offline brief this page now shows newer data (after a sync). */
export function refreshSavedPage(userId: string, path: string) {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: "refresh", user: userId, path });
}

/** Forgets every saved page on this phone (sign-out, the sign-in screen). */
export function forgetSavedPages() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "forget" });
  } catch {
    // no service worker
  }
  if ("caches" in window) void caches.keys().then((ks) => ks.filter((k) => k.startsWith("turfcut-pages")).forEach((k) => void caches.delete(k)));
}

/** On the sign-in pages: whoever signs in next never sees the last person's saved pages. */
export function ForgetSavedPages() {
  useEffect(() => forgetSavedPages(), []);
  return null;
}
