// Work's icon (#136): the worker's dock at 390 and the top bar at mouse 1024, recorded by the icon's lucide class.
// node work-icon.mjs <outDir> <commit>   env: STORAGE (a worker's storage state), BASE.
import pw from "/opt/node-tools/node_modules/playwright/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
const [out, commit] = process.argv.slice(2);
const STORAGE = process.env.STORAGE; if (!STORAGE) throw new Error("Set STORAGE to a worker's storage state");
const BASE = process.env.BASE ?? "http://localhost:3475";
mkdirSync(out, { recursive: true });
const b = await pw.chromium.launch(); const rows = [];
for (const [name, w, h, touch, sel] of [["dock-390", 390, 844, true, "nav.tabbar"], ["topbar-mouse-1024", 1024, 768, false, "nav.topnav"], ["topbar-mouse-1440", 1440, 900, false, "nav.topnav"]]) {
  const c = await b.newContext({ storageState: STORAGE, viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: touch, isMobile: w < 600, reducedMotion: "reduce" });
  const p = await c.newPage(); await p.goto(BASE + "/dashboard", { waitUntil: "networkidle", timeout: 240000 }); await p.waitForTimeout(1000);
  const icons = await p.evaluate((sel) => [...document.querySelectorAll(`${sel} a`)].map((a) => ({ label: (a.getAttribute("title") || a.textContent).trim().replace(/\d+.*$/, ""), icon: [...(a.querySelector("svg")?.classList ?? [])].find((k) => k.startsWith("lucide-") && k !== "lucide-icon") ?? null })), sel);
  await p.locator(sel).screenshot({ path: `${out}/work-icon-${name}.png` });
  rows.push({ view: name, icons, source: { commit } }); console.log(name, JSON.stringify(icons.filter((i) => /Jobs|Work/.test(i.label))));
  await c.close();
}
await b.close(); writeFileSync(`${out}/work-icon.json`, JSON.stringify(rows, null, 2) + "\n");
