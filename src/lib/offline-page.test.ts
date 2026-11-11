import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The "No signal" page (public/sw.js) is shown in place of a screen that was not saved. It has none
 * of the app's tabs, so it must never be a dead end (Caden, Nov 11: with a dropped connection the
 * app "won't let me switch between screens"). These pin the ways out; the walk-through itself was
 * run in a browser against a production build (see the pull request).
 */
const sw = readFileSync(join(__dirname, "../../public/sw.js"), "utf8");
const page = sw.slice(sw.indexOf("function offlinePage()"), sw.indexOf("async function cacheFirstStatic"));

describe("the no-signal page", () => {
  it("offers the saved field pages and a way back as full-size buttons", () => {
    expect(page).toMatch(/<a href="\/dashboard"[^>]*>Today<\/a>/);
    expect(page).toMatch(/<a href="\/shifts"[^>]*>My schedule<\/a>/);
    expect(page).toMatch(/id="back"[^>]*>Go back<\/button>/);
    expect(page).toMatch(/id="again"[^>]*>Try again<\/button>/);
    expect(page).toMatch(/min-height:48px/);
  });

  it("reopens the screen by itself when the network answers, and loads the screen an address change names", () => {
    // A HEAD request is not answered by the service worker (it handles GET only), so it succeeds only with real signal.
    expect(sw).toMatch(/if \(req\.method !== "GET"\) return;/);
    expect(page).toMatch(/fetch\(location\.href, \{ method: "HEAD", cache: "no-store"/);
    expect(page).toMatch(/\.then\(function \(\) \{ location\.reload\(\); \}\)/);
    for (const event of ["online", "pageshow", "popstate"]) expect(page).toContain(`addEventListener("${event}"`);
    expect(page).toMatch(/setInterval\(function \(\) \{ retry\(false\); \}, 5000\)/);
  });

  it("is never stored, and still answers 503 so nothing mistakes it for the screen", () => {
    expect(page).toMatch(/status: 503/);
    expect(page).toMatch(/"Cache-Control": "no-store"/);
  });
});
