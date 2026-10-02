"use client";

import { useEffect } from "react";

/**
 * Turns on the offline brief for a worker (public/sw.js) and asks it to
 * save these field pages now, while there's signal — e.g. tomorrow's
 * shift, so its staging point, turf and contacts open in a dead zone.
 */
export function OfflineBrief({ paths }: { paths: string[] }) {
  const key = paths.join("|");
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(async () => {
        const reg = await navigator.serviceWorker.ready;
        if (!cancelled && key) reg.active?.postMessage({ type: "save-pages", paths: key.split("|") });
        // Load the map's code once while there's signal, so it's saved too.
        if (navigator.serviceWorker.controller) void import("leaflet").catch(() => {});
      })
      .catch(() => {
        // Offline brief unavailable (e.g. private browsing): the app still works online.
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return null;
}
