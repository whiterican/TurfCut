import pw from "/opt/node-tools/node_modules/playwright/index.js";
import { readFileSync } from "node:fs";
// Mockup, for Astra: the worker dock with each candidate Work icon swapped in (browser-side; the app is unchanged).
// node work-icons.mjs   env: STORAGE (a worker's storage state), ICONS (icons.json from icons-to-svg.mjs), OUT, BASE.
const OUT = process.env.OUT ?? "."; const BASE = process.env.BASE ?? "http://localhost:3475";
const icons = JSON.parse(readFileSync(process.env.ICONS ?? "icons.json", "utf8"));
const b = await pw.chromium.launch();
for (const theme of ["light", "dark"]) {
  const c = await b.newContext({ storageState: process.env.STORAGE, viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, reducedMotion:"reduce" });
  await c.addInitScript((t) => { try { localStorage.setItem("turfcut-theme", t); } catch {} }, theme);
  const p = await c.newPage();
  await p.goto(BASE + "/shifts", { waitUntil:"networkidle", timeout:240000 }); await p.waitForTimeout(1200);
  for (const [name, svg] of Object.entries(icons)) {
    await p.evaluate(({svg}) => { const tab=[...document.querySelectorAll("nav.tabbar .tab")].find(t=>t.textContent.trim().startsWith("Work")); const old=tab.querySelector("svg"); const tmp=document.createElement("div"); tmp.innerHTML=svg; const n=tmp.firstChild; n.setAttribute("class", old.getAttribute("class")); old.replaceWith(n); }, { svg });
    await p.locator("nav.tabbar").screenshot({ path: `${OUT}/work-${theme}-${name}.png` });
  }
  await c.close();
}
await b.close();
console.log("done");
