// App-wide tablet audit (non-hiring routes): node audit.mjs <outDir> <commit> [routeFilter]
// For each role and route: load at 768x1024, record facts, screenshot; then 1024x768. Light and dark.
import pw from "/opt/node-tools/node_modules/playwright/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
const [out, commit, only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
// Inputs: FP (a folder of Playwright storage states named <role>.json: jordan = a worker, owner = an organization owner,
// staff = Turfcut staff), BASE (the local app). Fixture IDs below are the local test database's.
const BASE = process.env.BASE ?? "http://localhost:3475";
const FP = process.env.FP ?? "/tmp/claude-0/-home-user-TurfCut/af2c4bc2-e73f-5766-b49f-f47c873c5da0/scratchpad/fp/";
const JOB = "86d8312d-003d-4ffd-8b70-1a06f0d9b28f";
const SHIFT = "00000000-0000-0000-0000-000000000201";
const CONV = "09978025-13db-4bd4-bd1d-aa088a4ebbc1";
const JUR = "00000000-0000-0000-0000-000000000021";
const ORG = "00000000-0000-0000-0000-000000000001";
const PROFILE = "00000000-0000-0000-0000-000000000101";
const routes = [
  // [role (storage state, null = signed out), path, slug]
  [null, "/login", "login"], [null, "/signup", "signup"], [null, "/c", "campaigns-public"],
  ["jordan", "/dashboard", "w-home"], ["jordan", "/jobs", "w-jobs"], ["jordan", `/jobs/${JOB}`, "w-job"], ["jordan", "/jobs/invitations", "w-invitations"],
  ["jordan", "/shifts", "w-shifts"], [ "jordan", `/shifts/${SHIFT}`, "w-shift"], ["jordan", "/shifts/turf", "w-turf"],
  ["jordan", "/earnings", "w-earnings"], ["jordan", "/earnings/receipts", "w-receipts"], ["jordan", "/notifications", "w-notifications"],
  ["jordan", "/messages", "w-messages"], ["jordan", `/messages/${CONV}`, "w-conversation"], ["jordan", "/feed", "w-feed"],
  ["jordan", "/settings", "w-settings"], ["jordan", "/profile", "w-profile"], ["jordan", "/profile/availability", "w-availability"],
  ["jordan", "/profile/credentials", "w-credentials"], ["jordan", "/profile/preferences", "w-preferences"], ["jordan", "/profile/sharing", "w-sharing"], ["jordan", "/profile/preview", "w-preview"],
  ["owner", "/desk", "o-desk"], ["owner", "/jobs", "o-jobs"], ["owner", "/field", "o-field"], ["owner", "/field/review", "o-field-review"],
  ["owner", "/pay", "o-pay"], ["owner", "/pay/statements", "o-statements"], ["owner", "/org/credentials", "o-credentials"],
  ["owner", "/campaigns", "o-campaigns"], ["owner", "/org/settings", "o-settings"], ["owner", "/org/settings/members", "o-members"],
  ["owner", "/org/settings/members/roles", "o-roles"], ["owner", "/messages", "o-messages"], ["owner", "/notifications", "o-notifications"],
  ["staff", "/admin", "a-home"], ["staff", "/admin/audit", "a-audit"], ["staff", "/admin/organizations", "a-orgs"], ["staff", `/admin/organizations/${ORG}`, "a-org"],
  ["staff", "/admin/people", "a-people"], ["staff", `/admin/people/${PROFILE}`, "a-person"], ["staff", "/admin/jurisdictions", "a-jurisdictions"],
  ["staff", `/admin/jurisdictions/${JUR}`, "a-jurisdiction"], ["staff", "/admin/campaigns", "a-campaigns"], ["owner", "/messages/reports", "o-reports"],
].filter(([, , s]) => !only || s.includes(only));

const facts = () => {
  const vw = innerWidth;
  // Elements poking past the viewport, unless an ancestor scrolls or clips them sideways.
  const clipped = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== "visible") return true; } return false; };
  const offenders = [];
  for (const e of document.querySelectorAll("body *")) {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.right <= vw + 0.5 || getComputedStyle(e).position === "fixed") continue;
    if (clipped(e)) continue;
    offenders.push(`${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 3).join(".") : ""} r=${Math.round(r.right)}`);
    if (offenders.length >= 6) break;
  }
  const dock = document.querySelector("nav.tabbar"), rail = document.querySelector("aside nav, nav.rail, [data-rail]");
  const vis = (e) => !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0;
  // Native selects whose chosen option is wider than its text box (24px arrow allowance, as #130).
  const ctx = document.createElement("canvas").getContext("2d");
  const clippedSelects = [...document.querySelectorAll("select")].filter((s) => s.offsetWidth && s.checkVisibility?.()).flatMap((s) => {
    const c = getComputedStyle(s); ctx.font = c.font || `${c.fontWeight} ${c.fontSize} ${c.fontFamily}`;
    const text = s.selectedOptions[0]?.text ?? ""; const w = ctx.measureText(text).width;
    const avail = s.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight) - 24;
    return w > avail ? [`${s.name}: "${text}" ${Math.round(w)}>${Math.round(avail)}`] : [];
  });
  const main = document.querySelector("main");
  return {
    url: location.pathname, status: document.title,
    over: document.documentElement.scrollWidth - vw, offenders,
    dock: vis(dock), rail: vis(rail),
    mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
    clippedSelects,
    h1: document.querySelector("h1")?.textContent?.trim().slice(0, 60) ?? null,
  };
};
// Bottom clearance (CLEARANCE=1): scrolled to the end at 768x1024, how far the last content sits above the dock's top edge.
const clearance = () => {
  scrollTo(0, document.documentElement.scrollHeight);
  const dock = document.querySelector("nav.tabbar");
  const shown = dock && getComputedStyle(dock).display !== "none" && dock.getBoundingClientRect().height > 0;
  const main = document.querySelector("main") ?? document.body;
  let bottom = 0, last = null;
  // Only content a person can see: visible leaf elements not cut off by a scrolling or clipping ancestor
  // (closed disclosures, sr-only text and clipped overflow are not "behind the dock").
  for (const e of main.querySelectorAll("*")) {
    if (e.children.length || getComputedStyle(e).position === "fixed" || (dock && dock.contains(e))) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    let cut = false;
    for (let q = e.parentElement; q && q !== main; q = q.parentElement) { if (getComputedStyle(q).overflow !== "visible") { const qr = q.getBoundingClientRect(); if (r.top >= qr.bottom || r.bottom <= qr.top) { cut = true; break; } } }
    if (cut) continue;
    if (r.bottom > bottom) { bottom = r.bottom; last = e; }
  }
  const dockTop = shown ? dock.getBoundingClientRect().top : innerHeight;
  return { dock: !!shown, dockTop: Math.round(dockTop), contentBottom: Math.round(bottom), clearance: Math.round(dockTop - bottom), last: last ? `${last.tagName.toLowerCase()} "${(last.textContent || "").trim().slice(0, 40)}"` : null };
};

const b = await pw.chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
if (process.env.CLEARANCE) {
  const rows = [];
  for (const [role, path, slug] of routes) {
    const c = await b.newContext({ ...(role ? { storageState: FP + role + ".json" } : {}), viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1, hasTouch: true, timezoneId: "America/Denver" });
    const p = await c.newPage();
    let httpStatus = null;
    try { const r = await p.goto(BASE + path, { waitUntil: "networkidle", timeout: 240000 }); httpStatus = r?.status() ?? null; } catch {}
    await p.waitForTimeout(400);
    let m = null;
    for (let i = 0; i < 4 && !m; i++) { try { m = await p.evaluate(clearance); } catch { await p.waitForTimeout(500); } }
    await p.waitForTimeout(200);
    const file = `clearance-${slug}.png`;
    await p.screenshot({ path: `${out}/${file}` });
    rows.push({ slug, role, path, url: new URL(p.url()).pathname, httpStatus, ...m, file, source: { commit } });
    console.log(slug, httpStatus, JSON.stringify(m));
    await c.close();
  }
  await b.close();
  writeFileSync(`${out}/clearance.json`, JSON.stringify(rows, null, 2) + "\n");
  process.exit(0);
}
const manifest = [];
for (const [role, path, slug] of routes) for (const theme of ["light", "dark"]) {
  const c = await b.newContext({ ...(role ? { storageState: FP + role + ".json" } : {}), viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1, hasTouch: true, timezoneId: "America/Denver" });
  await c.addInitScript((t) => { try { localStorage.setItem("turfcut-theme", t); } catch {} }, theme);
  const p = await c.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("/realtime/v1/")) errs.push(m.text().slice(0, 160)); });
  let httpStatus = null;
  try { const r = await p.goto(BASE + path, { waitUntil: "networkidle", timeout: 240000 }); httpStatus = r?.status() ?? null; }
  catch (e) { errs.push("goto: " + String(e).slice(0, 120)); }
  for (const [w, h, tag] of [[768, 1024, "portrait"], [1024, 768, "landscape"]]) {
    await p.setViewportSize({ width: w, height: h }); // resized, not reloaded, like a rotation
    await p.waitForTimeout(400);
    let f = null;
    for (let i = 0; i < 4 && !f; i++) {
      try { f = await p.evaluate(facts); }
      catch { await p.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(500); }
    }
    if (!f) { errs.push("evaluate failed after retries"); f = { over: null, offenders: [], clippedSelects: [], dock: null, rail: null, mainWidth: null, url: null, h1: null }; }
    let file = null;
    if (theme === "light") {
      await p.evaluate(() => scrollTo(0, 0));
      file = `${slug}-${tag}.png`;
      await p.screenshot({ path: `${out}/${file}` });
    }
    manifest.push({ slug, role, path, theme, viewport: `${w}x${h}`, httpStatus, ...f, consoleErrors: [...errs], file, source: { commit } });
    const flag = f.over > 0 || f.offenders.length || f.clippedSelects.length || errs.length ? "  <-- CHECK" : "";
    console.log(`${slug} ${theme} ${w}x${h} http=${httpStatus} over=${f.over} dock=${f.dock} rail=${f.rail} main=${f.mainWidth} sel=${f.clippedSelects.length} errs=${errs.length}${flag}`);
  }
  await c.close();
}
await b.close();
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
