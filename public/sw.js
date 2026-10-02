/*
 * Turfcut offline brief (M6). Keeps the worker's field pages — today's and
 * upcoming shifts, Today, My shifts — and the app's own static files, so
 * the app opens with no signal. Field actions themselves are queued by the
 * page (lib/offline-queue.ts), not here.
 *
 * - Pages: network first; the copy is used only when the network fails.
 * - Static build files (/_next/static): cache first (their names change
 *   with every build).
 * - Never cached: API calls, server actions, data requests, other sites.
 * - Sign-out deletes every turfcut-* cache; a page that bounces to the
 *   login screen also empties the page cache.
 */
const PAGES = "turfcut-pages-v1";
const STATIC = "turfcut-static-v1";
const FIELD = /^\/(?:dashboard|shifts(?:\/[0-9a-f-]{36})?|shifts\/turf)\/?$/i;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith("turfcut-") && k !== PAGES && k !== STATIC) await caches.delete(k);
      await self.clients.claim();
    })()
  );
});

async function savePage(req, res) {
  if (res.redirected && new URL(res.url).pathname.startsWith("/login")) {
    await caches.delete(PAGES); // signed out: forget everything saved
    return;
  }
  if (!res.ok || res.type !== "basic") return;
  await (await caches.open(PAGES)).put(new URL(req.url).pathname, res.clone());
  // A saved page is no use offline without its own scripts and styles.
  await saveAssets(await res.text());
}

async function saveAssets(html) {
  const cache = await caches.open(STATIC);
  const urls = new Set(html.match(/\/_next\/static\/[^"'\s)<>\\]+/g) ?? []);
  for (const u of urls) {
    if (await cache.match(u)) continue;
    try {
      const r = await fetch(u);
      if (r.ok) await cache.put(u, r);
    } catch {
      // offline: next visit
    }
  }
}

function offlinePage() {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Turfcut</title>
<body style="font:16px system-ui;background:#0b120d;color:#eef2ea;padding:32px 16px;max-width:32rem;margin:auto">
<h1 style="font-size:24px">No signal</h1><p>This page wasn't saved on your phone. Your shift pages are saved when you open them with signal.</p>
<p><a style="color:#c5e88a" href="/shifts">My shifts</a> · <a style="color:#c5e88a" href="/dashboard">Today</a></p></body>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      (async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) await (await caches.open(STATIC)).put(req, res.clone());
        return res;
      })()
    );
    return;
  }
  if (req.mode !== "navigate") return;
  e.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        // Saved in the background: the page shows without waiting for it.
        if (FIELD.test(url.pathname)) e.waitUntil(savePage(req, res.clone()));
        return res;
      } catch {
        return (await caches.match(url.pathname, { cacheName: PAGES })) ?? offlinePage();
      }
    })()
  );
});

/* The page asks for the worker's upcoming shift pages to be saved ahead. */
self.addEventListener("message", (e) => {
  const d = e.data;
  if (!d || d.type !== "save-pages" || !Array.isArray(d.paths)) return;
  e.waitUntil(
    (async () => {
      for (const p of d.paths.slice(0, 10)) {
        if (typeof p !== "string" || !FIELD.test(p)) continue;
        try {
          const req = new Request(p, { credentials: "same-origin", headers: { Accept: "text/html" } });
          await savePage(req, await fetch(req));
        } catch {
          // offline: try again next visit
        }
      }
    })()
  );
});
