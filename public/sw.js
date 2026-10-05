/*
 * Turfcut offline brief (M6). Keeps the signed-in worker's field pages —
 * Today, My shifts and the shift pages the app asks for — and the app's own
 * static files, so the app opens with no signal. Field actions themselves
 * are queued by the page (lib/offline-queue.ts), not here.
 *
 * - Pages: network first. The saved copy is used when the network fails,
 *   answers with a server error, or takes over 8 seconds (a weak signal).
 * - Only pages the app listed for the current worker are saved, and a copy
 *   is used for 72 hours at most.
 * - The copies belong to one person: they're deleted when another worker
 *   signs in on the phone, on sign-out, on the sign-in page, and when a
 *   page bounces to sign-in (the session ended).
 * - Static build files (/_next/static): cache first (their names change
 *   with every build).
 * - Never cached: API calls, server actions, data requests, other sites.
 */
const PAGES = "turfcut-pages-v2";
const STATIC = "turfcut-static-v1";
const META = "turfcut-meta-v1";
// No trailing slash: Next.js redirects "/shifts/" to "/shifts", and a
// redirect on a field page reads as "signed out" below.
const FIELD = /^\/(?:dashboard|shifts(?:\/[0-9a-f-]{36})?|shifts\/turf)$/i;
const MAX_AGE_MS = 72 * 3_600_000;
const RESAVE_MS = 5 * 60_000;
const NETWORK_WAIT_MS = 8_000;
const MAX_STATIC = 400;

// Who the saved pages belong to and which paths may be saved. Kept in a
// cache too, because the browser stops idle service workers.
let state = null;
async function getState() {
  if (state) return state;
  try {
    const r = await (await caches.open(META)).match("/__state");
    state = r ? await r.json() : null;
  } catch {
    state = null;
  }
  state ??= { user: null, allowed: [] };
  return state;
}
async function setState(next) {
  state = next;
  try {
    await (await caches.open(META)).put("/__state", new Response(JSON.stringify(next), { headers: { "Content-Type": "application/json" } }));
  } catch {
    // kept in memory only
  }
}
/** Bumped whenever the saved pages are wiped, so a save already under way doesn't put one back. */
let generation = 0;
async function forget() {
  generation++;
  await caches.delete(PAGES);
  await setState({ user: null, allowed: [] });
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith("turfcut-") && ![PAGES, STATIC, META].includes(k)) await caches.delete(k);
      await self.clients.claim();
    })()
  );
});

const bouncedToLogin = (res) => res.type === "opaqueredirect" || (res.redirected && new URL(res.url).pathname.startsWith("/login"));

/**
 * Where a page sends the browser when it redirected after streaming began
 * (behind a loading screen, the status is already 200, so Next.js adds
 * <meta id="__next-page-redirect" content="1;url=/login">), or null.
 * Field pages keep no loading screen so they answer with a real redirect;
 * this is the backstop if one is ever added.
 */
function streamedRedirect(html) {
  const tag = /<meta\b[^>]*\bid="__next-page-redirect"[^>]*>/i.exec(html);
  if (!tag) return null;
  const to = /\bcontent="\d+;url=([^"]*)"/i.exec(tag[0]);
  return to ? to[1].replace(/&amp;/g, "&") : "";
}

async function savePage(path, res) {
  const gen = generation;
  if (bouncedToLogin(res)) return forget(); // signed out
  if (res.status === 404) {
    await (await caches.open(PAGES)).delete(path).catch(() => {});
    return;
  }
  if (!res.ok || res.type !== "basic" || res.redirected) return;
  const s = await getState();
  if (!s.user || !s.allowed.includes(path)) return;
  try {
    const html = await res.text();
    if (gen !== generation) return; // wiped meanwhile
    const to = streamedRedirect(html);
    if (to !== null) return to.startsWith("/login") ? forget() : undefined; // never save a redirect
    const headers = new Headers(res.headers);
    headers.set("x-turfcut-saved-at", String(Date.now()));
    await (await caches.open(PAGES)).put(path, new Response(html, { status: res.status, headers }));
    // A saved page is no use offline without its own scripts and styles.
    await saveAssets(html);
  } catch {
    // storage full or blocked: the page still works online
  }
}

async function saveAssets(html) {
  const cache = await caches.open(STATIC);
  const urls = new Set();
  for (const m of html.match(/\/_next\/static\/[^"'\s)<>\\]+/g) ?? []) {
    const u = new URL(m, self.location.origin);
    // Only the app's own build files, however the text was written.
    if (u.origin === self.location.origin && u.pathname.startsWith("/_next/static/") && !u.pathname.includes("..")) urls.add(u.pathname + u.search);
  }
  for (const u of urls) {
    if (await cache.match(u)) continue;
    try {
      const r = await fetch(u);
      if (r.ok) await cache.put(u, r);
    } catch {
      // offline: next visit
    }
  }
  await trimStatic(cache);
}

/** Old builds' files pile up: keep the newest MAX_STATIC. */
async function trimStatic(cache) {
  try {
    const keys = await cache.keys();
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_STATIC))) await cache.delete(k);
  } catch {
    // nothing to trim
  }
}

async function savedCopy(path) {
  const hit = await caches.match(path, { cacheName: PAGES });
  if (!hit) return null;
  const at = Number(hit.headers.get("x-turfcut-saved-at"));
  if (!Number.isFinite(at) || Date.now() - at > MAX_AGE_MS) return null;
  return hit;
}

function offlinePage() {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Turfcut</title>
<body style="font:16px system-ui;background:#1c142c;color:#f8f8f4;padding:32px 16px;max-width:32rem;margin:auto">
<h1 style="font-size:24px">No signal</h1><p>This page wasn't saved on your phone. Your shift pages are saved when you open Today or My shifts with signal.</p>
<p><a style="color:#ccea96" href="" onclick="location.reload();return false">Try again</a> · <a style="color:#ccea96" href="/shifts">My shifts</a> · <a style="color:#ccea96" href="/dashboard">Today</a></p></body>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

async function cacheFirstStatic(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    try {
      await (await caches.open(STATIC)).put(req, res.clone());
    } catch {
      // not saved; the response still goes back
    }
  }
  return res;
}

/** Network first; the saved copy on failure, a server error or a slow answer. */
async function fieldPage(e, url) {
  const path = url.pathname;
  // Cloned before the page gets the response; saved even if the copy answers first.
  const fetched = fetch(e.request).then((res) => ({ res, copy: res.clone() }));
  e.waitUntil(fetched.then(({ copy }) => savePage(path, copy)).catch(() => {}));
  const network = fetched.then(({ res }) => res);
  network.catch(() => {}); // a failure after the saved copy was served is expected
  const slow = new Promise((resolve) => setTimeout(() => resolve("slow"), NETWORK_WAIT_MS));
  try {
    const first = await Promise.race([network, slow]);
    if (first === "slow") {
      const copy = await savedCopy(path);
      return copy ?? (await network);
    }
    if (first.status >= 500) return (await savedCopy(path)) ?? first;
    return first;
  } catch {
    return (await savedCopy(path)) ?? offlinePage();
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(cacheFirstStatic(req));
    return;
  }
  if (req.mode !== "navigate") return;
  // The sign-in pages mean nobody (or somebody else) is signed in now.
  if (/^\/(login|signup)(\/|$)/.test(url.pathname)) e.waitUntil(forget());
  if (FIELD.test(url.pathname)) {
    e.respondWith(fieldPage(e, url));
    return;
  }
  // Every other page: the network, or the app's own "no signal" page.
  e.respondWith(fetch(req).catch(() => offlinePage()));
});

self.addEventListener("message", (e) => {
  const d = e.data;
  if (!d || typeof d !== "object") return;
  if (d.type === "forget") {
    e.waitUntil(forget());
    return;
  }
  /* After the page synced field entries: save its fresh copy now. */
  if (d.type === "refresh" && typeof d.user === "string" && typeof d.path === "string") {
    e.waitUntil(
      (async () => {
        const s = await getState();
        if (s.user !== d.user || !s.allowed.includes(d.path)) return;
        try {
          await savePage(d.path, await fetch(new Request(d.path, { credentials: "same-origin", redirect: "manual", headers: { Accept: "text/html" } })));
        } catch {
          // offline: the next visit saves it
        }
      })()
    );
    return;
  }
  /* The page lists the worker's field pages to keep (and save now). */
  if (d.type !== "save-pages" || typeof d.user !== "string" || !Array.isArray(d.paths)) return;
  e.waitUntil(
    (async () => {
      const s = await getState();
      if (s.user !== d.user) await forget(); // someone else's pages
      const paths = d.paths.filter((p) => typeof p === "string" && FIELD.test(p)).slice(0, 12);
      await setState({ user: d.user, allowed: paths });
      // Drop saved pages that aren't on the list any more.
      try {
        const cache = await caches.open(PAGES);
        for (const k of await cache.keys()) if (!paths.includes(new URL(k.url).pathname)) await cache.delete(k);
      } catch {
        // nothing saved
      }
      for (const p of paths) {
        const copy = await savedCopy(p);
        const at = copy ? Number(copy.headers.get("x-turfcut-saved-at")) : 0;
        if (Date.now() - at < RESAVE_MS) continue; // saved moments ago
        try {
          const res = await fetch(new Request(p, { credentials: "same-origin", redirect: "manual", headers: { Accept: "text/html" } }));
          await savePage(p, res);
        } catch {
          // offline: try again next visit
        }
      }
    })()
  );
});
