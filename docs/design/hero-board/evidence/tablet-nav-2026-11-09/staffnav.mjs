// Admin pages show only the console's navigation for a staff login with the WORKER role (tablet pass #135).
// node staffnav.mjs <outDir> <commit>   env: FP (folder holding staff.json, a Turfcut staff login whose role is WORKER), BASE.
import pw from "/opt/node-tools/node_modules/playwright/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
const [out, commit] = process.argv.slice(2);
const FP = process.env.FP; if (!FP) throw new Error("Set FP to a folder of storage states ending in /");
const BASE = process.env.BASE ?? "http://localhost:3475";
mkdirSync(out, { recursive: true });
const DEVICES = [["touch-768", [768, 1024], true], ["touch-1024", [1024, 768], true], ["mouse-1024", [1024, 768], false], ["mouse-1440", [1440, 900], false]];
const PATHS = ["/admin", "/admin/audit", "/admin/people", "/dashboard"];
const state = () => {
  const vis = (e) => !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0;
  return {
    url: location.pathname, role: document.querySelector(".staff-band") ? "admin page" : "worker page",
    workerTopBar: vis(document.querySelector("nav.topnav")), workerDock: vis(document.querySelector("nav.tabbar")),
    staffRail: vis(document.querySelector(".staff-rail")), sectionChips: vis(document.querySelector("main .lg\\:hidden nav, main .lg\\:hidden")),
    leaveAdmin: vis([...document.querySelectorAll(".staff-band-link")].find((a) => a.textContent.trim() === "Leave admin")),
    over: document.documentElement.scrollWidth - innerWidth,
  };
};
const b = await pw.chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
const rows = [];
for (const [dev, [w, h], touch] of DEVICES) for (const path of PATHS) {
  const c = await b.newContext({ storageState: FP + "staff.json", viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, timezoneId: "America/Denver" });
  const p = await c.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("/realtime/v1/")) errs.push(m.text().slice(0, 160)); });
  const r = await p.goto(BASE + path, { waitUntil: "networkidle", timeout: 240000 });
  await p.waitForFunction(() => document.readyState === "complete").catch(() => {}); await p.waitForTimeout(1000);
  const s = await p.evaluate(state);
  const file = `${dev}${path.replace(/\//g, "-")}.png`; await p.screenshot({ path: `${out}/${file}` });
  rows.push({ device: dev, viewport: `${w}x${h}`, touch, path, httpStatus: r?.status() ?? null, ...s, consoleErrors: errs, file, source: { commit } });
  console.log(dev, path, JSON.stringify(s), errs.length);
  await c.close();
}
await b.close();
writeFileSync(`${out}/manifest.json`, JSON.stringify(rows, null, 2) + "\n");
