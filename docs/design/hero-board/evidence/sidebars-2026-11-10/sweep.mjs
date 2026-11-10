import pw from "/opt/node-tools/node_modules/playwright/index.js";
const out = process.argv[2]; const S = process.env.S; if (!S) throw new Error("Set S to the folder that holds fp/jordan.json (a worker) and fp/owner.json (an organization owner)");
const CONV = "09978025-13db-4bd4-bd1d-aa088a4ebbc1", JOB = "86d8312d-003d-4ffd-8b70-1a06f0d9b28f";
const W = ["/dashboard", "/jobs", `/jobs/${JOB}`, "/shifts", "/shifts/turf", "/earnings", "/earnings/receipts", "/messages", `/messages/${CONV}`, "/profile", "/settings", "/notifications", "/feed", "/profile/credentials", "/profile/availability"];
const O = ["/desk", "/hiring", "/jobs", `/jobs/${JOB}`, "/field", "/pay", "/pay/statements", "/members", "/credentials", "/campaigns", "/messages", "/settings"];
const b = await pw.chromium.launch();
for (const [who, routes] of [["jordan", W], ["owner", O]]) for (const [w, h, touch] of [[390, 844, true], [768, 1024, true], [820, 1180, true], [1024, 768, true], [1280, 800, false], [1440, 900, false]]) {
  const c = await b.newContext({ storageState: `${S}/fp/${who}.json`, viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch && w < 600 });
  const p = await c.newPage();
  for (const r of routes) {
    await p.goto("http://localhost:3475" + r, { waitUntil: "networkidle", timeout: 240000 }); await p.waitForTimeout(350);
    const m = await p.evaluate(() => { const v = (q) => { const e = document.querySelector(q); return !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0; };
      const wraps = [...document.querySelectorAll(".data-table-wrap")].map((e) => e.scrollWidth - e.clientWidth).filter((x) => x > 1);
      return { over: document.documentElement.scrollWidth - innerWidth, dock: v("nav.tabbar"), strip: v(".phone-top"), hdr: v(".site-header"), hdrBtn: v(".site-header .menu-button"), rail: v(".org-rail"), tableScroll: wraps }; });
    console.log(who, w, r.slice(0, 26), JSON.stringify(m));
    if ([768, 1024].includes(w)) await p.screenshot({ path: `${out}/${who}-${w}${r.replace(/\//g, "_").slice(0, 22)}.png` });
  }
  await c.close();
}
await b.close();
