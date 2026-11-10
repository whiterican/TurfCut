import pw from "/opt/node-tools/node_modules/playwright/index.js";
const out = process.argv[2]; const S = process.env.S; if (!S) throw new Error("Set S to the folder that holds fp/jordan.json (a worker) and fp/owner.json (an organization owner)");
const CONV = "09978025-13db-4bd4-bd1d-aa088a4ebbc1", JOB = "86d8312d-003d-4ffd-8b70-1a06f0d9b28f";
const W = ["/dashboard", "/jobs", `/jobs/${JOB}`, "/shifts", "/shifts/turf", "/earnings", "/earnings/receipts", "/messages", `/messages/${CONV}`, "/profile", "/settings", "/notifications", "/feed"];
const O = ["/desk", "/hiring", "/jobs", "/field", "/pay", "/members", "/settings"];
const runs = [["w390", "jordan", [390, 844], true, W], ["w1100t", "jordan", [1100, 800], true, ["/dashboard", "/jobs", "/earnings"]], ["w1440", "jordan", [1440, 900], false, ["/dashboard", "/jobs", "/earnings", "/profile"]], ["o390", "owner", [390, 844], true, O], ["o1440", "owner", [1440, 900], false, ["/desk", "/hiring", "/pay", "/members"]]];
const b = await pw.chromium.launch();
for (const [tag, who, [w, h], touch, routes] of runs) {
  const c = await b.newContext({ storageState: `${S}/fp/${who}.json`, viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch && w < 600 });
  const p = await c.newPage();
  for (const r of routes) {
    await p.goto("http://localhost:3475" + r, { waitUntil: "networkidle", timeout: 240000 }); await p.waitForTimeout(500);
    const m = await p.evaluate(() => { const v = (q) => { const e = document.querySelector(q); return !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0; };
      return { over: document.documentElement.scrollWidth - innerWidth, dock: v("nav.tabbar"), strip: v(".phone-top"), hdrBtn: v(".site-header .menu-button"), topnav: v(".topnav"), rail: v(".org-rail"), bodyW: getComputedStyle(document.body).fontWeight }; });
    console.log(tag, r.slice(0, 22), JSON.stringify(m));
    await p.screenshot({ path: `${out}/${tag}${r.replace(/\//g, "_").slice(0, 24)}.png` });
  }
  await c.close();
}
await b.close();
