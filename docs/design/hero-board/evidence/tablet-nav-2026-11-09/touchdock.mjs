// Touch tablets keep the worker's labelled dock up to 1279 (tablet pass #135, option 1).
// node touchdock.mjs <outDir> <commit>   env: FP (folder of storage states: jordan.json = a worker, owner.json = an organization owner, staff.json = Turfcut staff with the WORKER role), BASE.
// Records the app's own state before each screenshot.
import pw from "/opt/node-tools/node_modules/playwright/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
const [out, commit] = process.argv.slice(2);
const FP = process.env.FP; if (!FP) throw new Error("Set FP to a folder of storage states ending in /");
const BASE = process.env.BASE ?? "http://localhost:3475";
mkdirSync(out, { recursive: true });
const CONV = "09978025-13db-4bd4-bd1d-aa088a4ebbc1";
const JOB = "86d8312d-003d-4ffd-8b70-1a06f0d9b28f";
const WORKER = ["/", "/dashboard", "/jobs", `/jobs/${JOB}`, "/jobs/invitations", "/shifts", "/shifts/turf", "/earnings", "/earnings/receipts", "/notifications", "/messages", `/messages/${CONV}`, "/feed", "/settings", "/profile", "/profile/availability", "/profile/credentials", "/profile/preferences", "/profile/sharing", "/profile/preview"];
// [name, viewport, touch]
const DEVICES = [["touch-1024", [1024, 768], true], ["touch-1180", [1180, 820], true], ["touch-1194", [1194, 834], true], ["mouse-1024", [1024, 768], false], ["touch-1280", [1280, 800], true]];

const state = () => {
  const vis = (e) => !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0;
  const dock = document.querySelector("nav.tabbar");
  return {
    url: location.pathname, coarse: matchMedia("(hover: none) and (pointer: coarse)").matches,
    dock: vis(dock), dockTabs: vis(dock) ? [...dock.querySelectorAll(".tab")].map((t) => t.textContent.replace(/\d+|unread.*$/g, "").trim()) : [],
    topnav: vis(document.querySelector("nav.topnav")), rail: vis(document.querySelector(".org-rail")),
    over: document.documentElement.scrollWidth - innerWidth,
  };
};
// The composer is sticky: stickyEdge is where its bottom sits once a long thread pushes it down, which must be above the dock.
// Scrolled to the end: how far the last visible content sits above the dock's top edge (as the tablet pass's audit.mjs).
const clearance = () => {
  scrollTo(0, document.documentElement.scrollHeight);
  const dock = document.querySelector("nav.tabbar");
  const shown = dock && getComputedStyle(dock).display !== "none" && dock.getBoundingClientRect().height > 0;
  const main = document.querySelector("main") ?? document.body;
  let bottom = 0;
  for (const e of main.querySelectorAll("*")) {
    if (e.children.length || getComputedStyle(e).position === "fixed" || (dock && dock.contains(e))) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    let cut = false;
    for (let q = e.parentElement; q && q !== main; q = q.parentElement) { if (getComputedStyle(q).overflow !== "visible") { const qr = q.getBoundingClientRect(); if (r.top >= qr.bottom || r.bottom <= qr.top) { cut = true; break; } } }
    if (!cut && r.bottom > bottom) bottom = r.bottom;
  }
  const dockTop = shown ? dock.getBoundingClientRect().top : innerHeight;
  return { clearance: Math.round(dockTop - bottom) };
};
const settle = (p) => p.waitForFunction(() => document.readyState === "complete", null, { timeout: 60000 }).then(() => p.waitForTimeout(1000)).catch(() => {});

const b = await pw.chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
const ctx = (role, [w, h], touch, extra = {}) => b.newContext({ storageState: FP + role + ".json", viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, reducedMotion: "reduce", timezoneId: "America/Denver", ...extra });
const rows = [];
for (const [dev, vp, touch] of DEVICES) for (const path of WORKER) {
  // The two tablet widths get every route; the others the home page and a conversation (the composer sits on the dock).
  if (!["touch-1024", "touch-1194"].includes(dev) && !["/", "/dashboard", `/messages/${CONV}`].includes(path)) continue;
  const c = await ctx("jordan", vp, touch); const p = await c.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("/realtime/v1/")) errs.push(m.text().slice(0, 160)); });
  const r = await p.goto(BASE + path, { waitUntil: "networkidle", timeout: 240000 }); await settle(p);
  const s = await p.evaluate(state);
  const composer = await p.evaluate(() => { const c = document.querySelector(".composer"), d = document.querySelector("nav.tabbar"); if (!c) return null; const cr = c.getBoundingClientRect(); const dr = d && getComputedStyle(d).display !== "none" ? d.getBoundingClientRect() : null; const stick = parseFloat(getComputedStyle(c).bottom); return { composerBottom: Math.round(cr.bottom), dockTop: dr ? Math.round(dr.top) : null, clear: dr ? cr.bottom <= dr.top + 0.5 : true, stickyBottom: stick, stickyEdge: Math.round(innerHeight - stick), stickyClearOfDock: dr ? innerHeight - stick <= dr.top + 0.5 : true }; });
  const cl = await p.evaluate(clearance);
  const slug = path.replace(/\/[0-9a-f-]{36}/, "/id").replace(/\//g, "-").replace(/^-/, "");
  const file = `${dev}-${slug}.png`; await p.waitForTimeout(200); await p.screenshot({ path: `${out}/${file}` });
  rows.push({ device: dev, viewport: vp.join("x"), touch, path, httpStatus: r?.status() ?? null, ...s, ...cl, composer, consoleErrors: errs, file, source: { commit } });
  console.log(dev, path, JSON.stringify({ ...s, ...cl, composer, errs: errs.length }));
  await c.close();
}
// The More sheet on a touch tablet: opens, lists what the top bar showed and the dock doesn't, survives a rotation, closes when the dock goes.
const sheet = [];
for (const [name, touch] of [["touch", true], ["mouse", false]]) {
  const c = await ctx("jordan", [768, 1024], touch); const p = await c.newPage();
  await p.goto(BASE + "/dashboard", { waitUntil: "networkidle", timeout: 240000 }); await settle(p);
  await p.locator("nav.tabbar button", { hasText: "More" }).click(); await p.waitForTimeout(400);
  const before = await p.evaluate(() => ({ open: !!document.querySelector("dialog.more-sheet")?.open, rows: [...document.querySelectorAll("dialog.more-sheet .more-row")].map((a) => a.textContent.trim()) }));
  await p.setViewportSize({ width: 1024, height: 768 }); await p.waitForTimeout(600);
  const after = await p.evaluate(() => { const d = document.querySelector("dialog.more-sheet"); const r = d?.getBoundingClientRect(); return { open: !!d?.open, visible: !!d && getComputedStyle(d).display !== "none" && r.height > 0, panelTop: r ? Math.round(r.top) : null }; });
  if (name === "touch") await p.screenshot({ path: `${out}/more-sheet-touch-1024.png` });
  sheet.push({ pointer: name, rotatedTo: "1024x768", openAt768: before.open, rows: before.rows, openAfterRotation: after.open, visibleAfterRotation: after.visible, sheetTop: after.panelTop, expected: touch ? "stays open and visible (the dock stays)" : "closes (the dock goes)", source: { commit } });
  console.log("sheet", name, JSON.stringify(sheet.at(-1)));
  await c.close();
}
// Opened on the tablet itself (1024x768, touch): the sheet shows, and choosing a row navigates.
{
  const c = await ctx("jordan", [1024, 768], true); const p = await c.newPage();
  await p.goto(BASE + "/dashboard", { waitUntil: "networkidle", timeout: 240000 }); await settle(p);
  await p.locator("nav.tabbar button", { hasText: "More" }).click(); await p.waitForTimeout(500);
  const shown = await p.evaluate(() => { const d = document.querySelector("dialog.more-sheet"); const r = d.getBoundingClientRect(); return { open: d.open, visible: getComputedStyle(d).display !== "none" && r.height > 0, sheetTop: Math.round(r.top) }; });
  await p.screenshot({ path: `${out}/more-sheet-touch-1024-direct.png` });
  await p.locator("dialog.more-sheet a", { hasText: "Earnings" }).first().click(); await p.waitForURL("**/earnings", { timeout: 60000 }).catch(() => {}); await settle(p);
  const after = await p.evaluate(() => ({ url: location.pathname, open: !!document.querySelector("dialog.more-sheet")?.open }));
  sheet.push({ pointer: "touch", openedAt: "1024x768", ...shown, choseEarnings: after, expected: "visible; Earnings navigates and the sheet closes", source: { commit } });
  console.log("sheet direct", JSON.stringify(sheet.at(-1)));
  await c.close();
}
// Typing on a touch tablet: the dock steps aside for the keyboard and the top bar stands in (worker);
// on an admin page neither worker bar comes back (staff, FP must hold staff.json).
const typing = [];
for (const [role, path, field] of [["jordan", "/profile/availability", "input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea"], ["staff", "/admin/people", "input[type=search], input:not([type=checkbox]):not([type=radio]):not([type=hidden])"]]) {
  const c = await ctx(role, [1024, 768], true); const p = await c.newPage();
  await p.goto(BASE + path, { waitUntil: "networkidle", timeout: 240000 }); await settle(p);
  await p.evaluate(() => document.activeElement?.blur?.());
  const before = await p.evaluate(state);
  await p.locator(field).first().focus(); await p.waitForTimeout(300);
  const during = await p.evaluate(state);
  typing.push({ role, path, viewport: "1024x768", touch: true, before: { dock: before.dock, topnav: before.topnav }, whileTyping: { dock: during.dock, topnav: during.topnav }, expected: role === "staff" ? "neither worker bar on an admin page" : "dock steps aside, top bar stands in", source: { commit } });
  console.log("typing", role, JSON.stringify(typing.at(-1)));
  await c.close();
}
// An organization owner on a touch tablet keeps the rail: the change is the worker's dock only.
{
  const c = await ctx("owner", [1024, 768], true); const p = await c.newPage();
  await p.goto(BASE + "/desk", { waitUntil: "networkidle", timeout: 240000 }); await settle(p);
  const s = await p.evaluate(state); rows.push({ device: "touch-1024", viewport: "1024x768", touch: true, path: "/desk", role: "owner", ...s, file: "touch-1024-owner-desk.png", source: { commit } });
  await p.screenshot({ path: `${out}/touch-1024-owner-desk.png` }); console.log("owner", JSON.stringify(s)); await c.close();
}
await b.close();
writeFileSync(`${out}/manifest.json`, JSON.stringify({ rows, sheet, typing }, null, 2) + "\n");
