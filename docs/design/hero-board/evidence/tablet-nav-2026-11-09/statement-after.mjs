// The statement period's table with the job under the date (#136): at each width, and in print, whether the table
// overflows its box, whether Current state is cut off, the job's own text lines, and the table's height.
// node statement-after.mjs <outDir> <commit>   env: STORAGE (an organization owner's storage state), BASE, PERIOD (default 2026-10).
import pw from "/opt/node-tools/node_modules/playwright/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
const [out, commit] = process.argv.slice(2);
const STORAGE = process.env.STORAGE; if (!STORAGE) throw new Error("Set STORAGE to an organization owner's storage state");
const BASE = process.env.BASE ?? "http://localhost:3475"; const PERIOD = process.env.PERIOD ?? "2026-10";
mkdirSync(out, { recursive: true });
const measure = () => {
  const t = document.querySelector("table.statement-lines"), wrap = t.closest(".data-table-wrap"), box = wrap.getBoundingClientRect();
  const cut = [...t.querySelectorAll('tbody td[data-label="Current state"]')].some((c) => c.getBoundingClientRect().right > box.right + 1 || c.getBoundingClientRect().right > innerWidth + 1);
  const job = t.querySelector(".statement-job"); const r = document.createRange(); r.selectNodeContents(job);
  const lines = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size;
  return { stacked: getComputedStyle(t).display === "block", overflow: wrap.scrollWidth - wrap.clientWidth, tableWidth: Math.round(t.getBoundingClientRect().width), currentStateCutOff: cut, jobLines: lines, tableHeight: Math.round(t.getBoundingClientRect().height), pageOver: document.documentElement.scrollWidth - innerWidth };
};
const b = await pw.chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
const rows = [];
// Print: a Letter page's printable width is about 720 CSS px; the print rules let the table run whole.
for (const [w, h, mode] of [[390, 844, "screen"], [640, 900, "screen"], [768, 1024, "screen"], [1024, 768, "screen"], [1440, 900, "screen"], [720, 960, "print"]]) {
  const c = await b.newContext({ storageState: STORAGE, viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 1440, isMobile: w < 600, reducedMotion: "reduce", timezoneId: "America/Denver" });
  const p = await c.newPage(); const errs = [];
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("/realtime/v1/")) errs.push(m.text().slice(0, 160)); });
  await p.goto(`${BASE}/pay/statements/${PERIOD}`, { waitUntil: "networkidle", timeout: 240000 }); await p.waitForTimeout(1000);
  if (mode === "print") await p.emulateMedia({ media: "print" });
  const m = await p.evaluate(measure);
  const file = `statement-after-${mode}-${w}.png`;
  const el = p.locator("table.statement-lines").locator("xpath=ancestor::*[contains(@class,'data-table-wrap')]");
  await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: `${out}/${file}` });
  rows.push({ viewport: `${w}x${h}`, media: mode, ...m, consoleErrors: errs, file, source: { commit } });
  console.log(mode, w, JSON.stringify(m), errs.length);
  await c.close();
}
await b.close();
writeFileSync(`${out}/statement-after.json`, JSON.stringify(rows, null, 2) + "\n");
