import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * The "No signal" page (public/sw.js) is shown in place of a screen that was not saved. It has none
 * of the app's tabs, so it must never be a dead end (Caden, Nov 11: with a dropped connection the
 * app "won't let me switch between screens"). These run the page's own script against a fake
 * browser; the walk-through itself was run in Chromium against a production build.
 */
const sw = readFileSync(join(__dirname, "../../public/sw.js"), "utf8");
const page = sw.slice(sw.indexOf("function offlinePage()"), sw.indexOf("async function cacheFirstStatic"));
const script = page.slice(page.indexOf("<script>") + 8, page.indexOf("</script>"));

/** A browser just big enough for the page's script. `answer` decides each probe. */
function open(answer: () => Promise<{ ok: boolean }>, historyLength = 2) {
  const listeners: Record<string, ((e: { persisted?: boolean }) => void)[]> = {};
  const els: Record<string, { textContent: string; onclick?: () => void }> = { state: { textContent: "Waiting for signal…" }, again: { textContent: "" }, back: { textContent: "" } };
  const timers: { fn: () => void; ms: number; every: boolean }[] = [];
  const store = new Map<string, string>();
  const w = {
    probes: [] as { url: string; init: { method?: string; cache?: string } }[],
    reloads: 0,
    backs: 0,
    now: 1_000_000,
    href: "/jobs",
    els,
    timers,
    fire: (name: string, e: { persisted?: boolean } = {}) => (listeners[name] ?? []).forEach((f) => f(e)),
    settle: () => new Promise((r) => setTimeout(r, 0)),
  };
  const location = { reload: () => void w.reloads++ };
  Object.defineProperty(location, "href", { get: () => w.href, set: (v: string) => void (w.href = v) });
  const add = (name: string, f: (e: { persisted?: boolean }) => void) => void (listeners[name] ??= []).push(f);
  vm.runInNewContext(script, {
    document: { getElementById: (id: string) => els[id], addEventListener: add, hidden: false },
    addEventListener: add,
    location,
    history: { length: historyLength, back: () => void w.backs++ },
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    Date: { now: () => w.now },
    AbortController,
    Error,
    Number,
    String,
    fetch: (url: string, init: { method?: string; cache?: string }) => (w.probes.push({ url, init }), answer()),
    setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms, every: false }),
    setInterval: (fn: () => void, ms: number) => timers.push({ fn, ms, every: true }),
    clearTimeout: () => {},
  });
  return w;
}
const up = () => Promise.resolve({ ok: true });
const down = () => Promise.reject(new Error("offline"));

describe("the no-signal page", () => {
  it("offers the saved field pages and a way back as full-size buttons", () => {
    expect(page).toMatch(/<a href="\/dashboard"[^>]*>Today<\/a>/);
    expect(page).toMatch(/<a href="\/shifts"[^>]*>My schedule<\/a>/);
    expect(page).toMatch(/id="back"[^>]*>Go back<\/button>/);
    expect(page).toMatch(/id="again"[^>]*>Try again<\/button>/);
    expect(page).toMatch(/min-height:48px/);
    expect(page).toContain('<html lang="en">');
  });

  it("probes a small fixed file, never the page's own address, with a request the service worker does not answer", async () => {
    const w = open(down);
    w.fire("online");
    await w.settle();
    expect(w.probes).toHaveLength(1);
    // Asking for the page itself would run it: a one-time sign-in link would be spent by the probe.
    expect(w.probes[0].url).toBe("/sw.js");
    expect(w.probes[0].init.method).toBe("HEAD");
    expect(w.probes[0].init.cache).toBe("no-store");
    expect(sw).toMatch(/if \(req\.method !== "GET"\) return;/);
  });

  it("stays put without signal, and reopens the screen by itself once the network answers", async () => {
    let answer: () => Promise<{ ok: boolean }> = down;
    const w = open(() => answer());
    for (const e of ["online", "pageshow", "visibilitychange"]) w.fire(e);
    await w.settle();
    expect(w.reloads).toBe(0);
    expect(w.els.state.textContent).toBe("Waiting for signal…");
    // It keeps checking on its own (phones do not always say when signal returns).
    const tick = w.timers.find((t) => t.every);
    expect(tick?.ms).toBe(5000);
    answer = up;
    tick!.fn();
    await w.settle();
    expect(w.reloads).toBe(1);
  });

  it("does not spin: at most one automatic reload in ten seconds, a wrong answer is not signal, and Try again always acts", async () => {
    const w = open(up);
    w.fire("online");
    await w.settle();
    w.fire("pageshow");
    await w.settle();
    expect(w.reloads).toBe(1);
    w.els.again.onclick!();
    await w.settle();
    expect(w.reloads).toBe(2);
    w.now += 10_001;
    w.fire("online");
    await w.settle();
    expect(w.reloads).toBe(3);

    const portal = open(() => Promise.resolve({ ok: false }));
    portal.els.again.onclick!();
    await portal.settle();
    expect(portal.reloads).toBe(0);
    expect(portal.els.state.textContent).toBe("Still no signal.");
  });

  it("is never left waiting on one probe: a failed one frees the next, and a page restored from the back-forward cache starts clean", async () => {
    let answer: () => Promise<{ ok: boolean }> = () => new Promise(() => {}); // never settles
    const w = open(() => answer());
    w.fire("online");
    w.fire("online");
    expect(w.probes).toHaveLength(1);
    answer = down;
    w.fire("pageshow", { persisted: true });
    await w.settle();
    expect(w.probes).toHaveLength(2);
    w.fire("online");
    expect(w.probes).toHaveLength(3);
    // The probe gives up after eight seconds.
    expect(w.timers.some((t) => !t.every && t.ms === 8000)).toBe(true);
  });

  it("Go back always leads somewhere: the screen behind, or Today when there is none", () => {
    const stuck = open(down);
    stuck.els.back.onclick!();
    expect(stuck.backs).toBe(1);
    stuck.timers.filter((t) => !t.every && t.ms === 700).forEach((t) => t.fn());
    expect(stuck.href).toBe("/dashboard");

    // Going back changed the address without loading the screen (seen in Chromium): the page loads it, and does not then jump to Today.
    const went = open(down);
    went.els.back.onclick!();
    went.fire("popstate");
    expect(went.reloads).toBe(1);
    went.timers.filter((t) => !t.every && t.ms === 700).forEach((t) => t.fn());
    expect(went.href).toBe("/jobs");
  });

  it("is never stored, and still answers 503 so nothing mistakes it for the screen", () => {
    expect(page).toMatch(/status: 503/);
    expect(page).toMatch(/"Cache-Control": "no-store"/);
  });
});
